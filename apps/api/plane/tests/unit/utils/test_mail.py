# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Mail: the shared sender, its retry rules, the delivery log, and the tasks built on it."""

import datetime
import smtplib
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core import mail

from plane.bgtasks.email_notification_task import send_email_notification
from plane.bgtasks.magic_link_code_task import magic_link
from plane.db.models import EmailDelivery, EmailNotificationLog, Issue, Project, ProjectMember, State, User
from plane.utils.mail import TransientMailError, is_transient, send_mail

CONFIG = "plane.utils.mail.get_email_configuration"
# host, user, password, port, tls, ssl, from
SMTP = ("smtp.example.org", "plane@example.org", "secret", "587", "1", "0", "")


def task(task_id="task-1", retries=0, max_retries=5):
    return SimpleNamespace(request=SimpleNamespace(id=task_id, retries=retries), max_retries=max_retries)


@pytest.fixture
def smtp():
    with patch(CONFIG, return_value=SMTP):
        yield


@pytest.mark.unit
@pytest.mark.django_db
class TestSendMail:
    def test_sends_and_records(self, smtp):
        delivery = send_mail("test", "someone@example.org", "Hello", "<p>Hi there</p>")

        assert (delivery.status, delivery.attempts) == ("sent", 1)
        assert delivery.sent_at is not None
        [sent] = mail.outbox
        assert sent.to == ["someone@example.org"]
        assert sent.alternatives[0][0] == "<p>Hi there</p>"
        assert "Hi there" in sent.body

    def test_sender_falls_back_to_the_smtp_account_never_plane_so(self, smtp):
        send_mail("test", "someone@example.org", "Hello", "<p>Hi</p>")
        assert mail.outbox[0].from_email == "plane@example.org"

    def test_explicit_sender_wins(self):
        with patch(CONFIG, return_value=SMTP[:-1] + ("Plane <noreply@example.org>",)):
            send_mail("test", "someone@example.org", "Hello", "<p>Hi</p>")
        assert mail.outbox[0].from_email == "Plane <noreply@example.org>"

    def test_without_smtp_the_failure_is_recorded(self):
        with patch(CONFIG, return_value=("", "", "", "587", "1", "0", "")):
            delivery = send_mail("test", "someone@example.org", "Hello", "<p>Hi</p>")
        assert delivery.status == "failed"
        assert "not configured" in delivery.last_error
        assert not mail.outbox

    def test_without_any_sender_the_failure_is_recorded(self):
        with patch(CONFIG, return_value=("smtp.example.org", "apikey", "x", "587", "1", "0", "")):
            delivery = send_mail("test", "someone@example.org", "Hello", "<p>Hi</p>")
        assert delivery.status == "failed"
        assert "sender" in delivery.last_error

    def test_secret_subjects_are_logged_redacted(self, smtp):
        delivery = send_mail("magic_code", "a@example.org", "Your code is 123456", "<p>x</p>", log_subject="Your code")
        assert delivery.subject == "Your code"
        assert mail.outbox[0].subject == "Your code is 123456"

    def test_attachments(self, smtp):
        send_mail("export", "a@example.org", "Export", "<p>x</p>", attachments=[("a.csv", "x,y\n", "text/csv")])
        assert mail.outbox[0].attachments == [("a.csv", "x,y\n", "text/csv")]


@pytest.mark.unit
@pytest.mark.django_db
class TestRetries:
    def test_transient_failure_retries_on_the_same_record(self, smtp):
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=smtplib.SMTPServerDisconnected("gone")):
            with pytest.raises(TransientMailError):
                send_mail("test", "a@example.org", "Hello", "<p>x</p>", task=task(retries=0))
        first = EmailDelivery.objects.get(task_id="task-1")
        assert (first.status, first.attempts) == ("retrying", 1)
        assert "gone" in first.last_error

        delivery = send_mail("test", "a@example.org", "Hello", "<p>x</p>", task=task(retries=1))
        assert (delivery.pk, delivery.status, delivery.attempts) == (first.pk, "sent", 2)

    def test_last_try_fails_for_good(self, smtp):
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=TimeoutError("slow")):
            delivery = send_mail("test", "a@example.org", "Hello", "<p>x</p>", task=task(retries=5))
        assert delivery.status == "failed"

    def test_permanent_failure_is_not_retried(self, smtp):
        refused = smtplib.SMTPAuthenticationError(535, b"bad credentials")
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=refused):
            delivery = send_mail("test", "a@example.org", "Hello", "<p>x</p>", task=task(retries=0))
        assert delivery.status == "failed"
        assert "bad credentials" in delivery.last_error

    @pytest.mark.parametrize(
        "error, expected",
        [
            (smtplib.SMTPResponseException(451, b"try later"), True),
            (smtplib.SMTPResponseException(550, b"no such user"), False),
            (smtplib.SMTPAuthenticationError(535, b"no"), False),
            (smtplib.SMTPRecipientsRefused({}), False),
            (smtplib.SMTPServerDisconnected("x"), True),
            (ConnectionRefusedError(), True),
            (TimeoutError(), True),
            (ValueError("bug"), False),
        ],
    )
    def test_classification(self, error, expected):
        assert is_transient(error) is expected


@pytest.mark.unit
@pytest.mark.django_db
class TestTasks:
    def test_magic_code_mail_keeps_the_code_out_of_the_log(self, smtp):
        magic_link("someone@example.org", "key", "123456")

        assert "123456" in mail.outbox[0].subject
        delivery = EmailDelivery.objects.get(kind="magic_code")
        assert "123456" not in delivery.subject

    def test_work_item_update_mail_needs_no_redis_origin(self, smtp, workspace, create_user):
        """The digest used to need a Redis key that expired after 10 minutes; without it the
        mail was dropped. Nothing sets that key here, and the mail still goes out."""
        project = Project.objects.create(name="Mail", identifier="ML", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=workspace)
        issue = Issue.objects.create(name="Ship it", state=state, project=project, workspace=workspace)
        actor = User.objects.create(email="actor@example.org", username="mail-actor", first_name="Actor")
        log = EmailNotificationLog.objects.create(
            receiver=create_user,
            triggered_by=actor,
            entity_identifier=issue.id,
            entity_name="issue",
            entity="issue",
            data={},
        )
        when = datetime.datetime(2026, 10, 14, 12, 0).isoformat()
        notification_data = {
            str(actor.id): [
                {
                    "issue_activity": {
                        "field": "priority",
                        "old_value": "low",
                        "new_value": "high",
                        "activity_time": when,
                    }
                }
            ]
        }

        send_email_notification(str(issue.id), notification_data, str(create_user.id), [str(log.id)])

        [sent] = mail.outbox
        assert sent.to == [create_user.email]
        assert "ML-" in sent.subject
        assert "http://localhost" in sent.alternatives[0][0]
        log.refresh_from_db()
        assert log.sent_at is not None
