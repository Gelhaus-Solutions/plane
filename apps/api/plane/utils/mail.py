# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Sending mail: one connection builder, one sender, every attempt recorded.

Every mail task renders its template and calls ``send_mail``. A failure worth retrying
(the server is unreachable, times out or answers 4xx) raises ``TransientMailError``,
which the task's ``MAIL_TASK`` options turn into a Celery retry with backoff. Anything
else (bad credentials, a 5xx refusal, no SMTP configured) is final. Either way the
attempt lands in ``EmailDelivery`` for God mode.
"""

import logging
import smtplib
import socket
from collections import namedtuple

from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone

from plane.db.models import EmailDelivery
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html

SMTP_TIMEOUT = 30

logger = logging.getLogger("plane.worker")

MailSettings = namedtuple("MailSettings", ["host", "port", "username", "password", "use_tls", "use_ssl", "sender"])


class TransientMailError(Exception):
    """The mail could go out on a later try."""


# Celery options for a task that sends mail: up to five retries, about 1, 2, 4, 8 and 16 minutes apart.
MAIL_TASK = {
    "bind": True,
    "autoretry_for": (TransientMailError,),
    "retry_backoff": 60,
    "retry_backoff_max": 1800,
    "retry_jitter": True,
    "max_retries": 5,
}


def mail_settings():
    host, username, password, port, use_tls, use_ssl, sender = get_email_configuration()
    username = username or ""
    # Without a sender of its own, mail goes out as the SMTP account, never as someone else's domain
    if not sender and "@" in username:
        sender = username
    return MailSettings(
        host=host or "",
        port=int(port or 587),
        username=username or None,
        password=password or None,
        use_tls=str(use_tls) == "1",
        use_ssl=str(use_ssl) == "1",
        sender=sender or "",
    )


def open_connection(settings=None, timeout=SMTP_TIMEOUT):
    settings = settings or mail_settings()
    return get_connection(
        host=settings.host,
        port=settings.port,
        username=settings.username,
        password=settings.password,
        use_tls=settings.use_tls,
        use_ssl=settings.use_ssl,
        timeout=timeout,
    )


def is_transient(error):
    """Whether trying the same mail again later can work."""
    if isinstance(error, (smtplib.SMTPAuthenticationError, smtplib.SMTPSenderRefused, smtplib.SMTPRecipientsRefused)):
        return False
    if isinstance(error, smtplib.SMTPResponseException):
        return 400 <= error.smtp_code < 500
    return isinstance(
        error, (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, socket.timeout, TimeoutError, OSError)
    )


def _delivery(kind, recipient, subject, task):
    task_id = getattr(getattr(task, "request", None), "id", None)
    if task_id:
        delivery, _ = EmailDelivery.objects.get_or_create(
            task_id=task_id, recipient=recipient, defaults={"kind": kind, "subject": subject[:500]}
        )
        return delivery
    return EmailDelivery.objects.create(kind=kind, recipient=recipient, subject=subject[:500])


def _is_last_try(task):
    if task is None:
        return True
    return task.request.retries >= (task.max_retries or 0)


def send_mail(kind, to, subject, html, task=None, log_subject=None, attachments=()):
    """Send one mail and record the attempt.

    ``task`` is the bound Celery task, so retries of one mail share a record.
    ``log_subject`` replaces a subject that carries a secret, such as a sign-in code.
    ``attachments`` are ``(filename, content, mimetype)`` tuples.
    Returns the ``EmailDelivery``; raises ``TransientMailError`` when a retry is due.
    """
    delivery = _delivery(kind, to, log_subject or subject, task)
    delivery.attempts += 1
    settings = mail_settings()

    def finish(status, error=""):
        delivery.status = status
        delivery.last_error = error[:2000]
        if status == EmailDelivery.Status.SENT:
            delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "last_error", "sent_at", "attempts", "updated_at"])
        return delivery

    if not settings.host:
        return finish(EmailDelivery.Status.FAILED, "SMTP is not configured (God mode > Email)")
    if not settings.sender:
        return finish(EmailDelivery.Status.FAILED, "No sender address: set the From address in God mode > Email")

    message = EmailMultiAlternatives(
        subject=subject,
        body=generate_plain_text_from_html(html),
        from_email=settings.sender,
        to=[to],
        connection=open_connection(settings),
    )
    message.attach_alternative(html, "text/html")
    for filename, content, mimetype in attachments:
        message.attach(filename, content, mimetype)

    try:
        message.send(fail_silently=False)
    except Exception as error:
        reason = f"{type(error).__name__}: {error}"
        if is_transient(error) and not _is_last_try(task):
            finish(EmailDelivery.Status.RETRYING, reason)
            logger.warning(f"Mail {kind} to {to} failed, retrying: {reason}")
            raise TransientMailError(reason) from error
        logger.error(f"Mail {kind} to {to} failed: {reason}")
        return finish(EmailDelivery.Status.FAILED, reason)

    logger.info(f"Mail {kind} sent to {to}")
    return finish(EmailDelivery.Status.SENT)
