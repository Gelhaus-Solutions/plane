# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent sessions: registration with a bot key, reopening, ending, the sweep, and attribution."""

import json
from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

import pytest
from django.utils import timezone

from django.test import RequestFactory

from plane.bgtasks.cleanup_task import delete_ended_agent_sessions
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.logger_task import log_to_postgres
from plane.db.models import (
    AgentSession,
    APIActivityLog,
    APIToken,
    Issue,
    IssueActivity,
    IssueComment,
    Project,
    ProjectMember,
    Workspace,
    WorkspaceMember,
)
from plane.middleware.logger import APITokenLogMiddleware
from plane.utils import agent_sessions, bots
from plane.utils.agent_session_context import acting_as, active_session_id, stamp_agent_session
from plane.utils.agent_sessions import SessionError

ACTIVITY_TASK = "plane.bgtasks.issue_activities_task.issue_activity"


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def key(bot):
    return bots.issue_token(bot, label="claude", allowed_rate_limit="300/min")


def register(key, workspace, **data):
    payload = {"harness": "claude-code", "external_id": "6995b6f5-28a7-488f-90b6-823339d48fe1"}
    payload.update(data)
    return agent_sessions.register(key, workspace, payload)


@pytest.mark.unit
@pytest.mark.django_db
class TestRegister:
    def test_a_session_gets_its_own_token(self, workspace, bot, key):
        session, token, created = register(
            key, workspace, primary_dir="/Users/x/Git-Repos/plane", host="mac", model="claude-opus-5-5"
        )
        assert created
        assert (session.bot_id, session.workspace_id, session.status) == (bot.id, workspace.id, "live")
        assert session.name == "plane@6995b6f5"
        assert (session.primary_dir, session.host, session.model) == (
            "/Users/x/Git-Repos/plane",
            "mac",
            "claude-opus-5-5",
        )
        assert token.agent_session_id == session.id
        assert token.user_id == bot.user_id and token.token != key.token
        assert token.allowed_rate_limit == "300/min" and token.access == key.access
        assert timedelta(days=29) < token.expired_at - timezone.now() <= timedelta(days=30)

    def test_registering_again_reopens_and_revokes_the_old_token(self, workspace, key):
        first, old, _ = register(key, workspace, primary_dir="/a/plane")
        agent_sessions.end(first)
        again, new, created = register(key, workspace, git_branch="main")
        assert not created and again.id == first.id
        assert (again.status, again.ended_at, again.git_branch, again.primary_dir) == ("live", None, "main", "/a/plane")
        assert not APIToken.objects.get(pk=old.pk).is_active
        assert APIToken.objects.get(pk=new.pk).is_active

    def test_a_given_name_wins(self, workspace, key):
        session, _, _ = register(key, workspace, name="api@6995b6f5")
        assert session.name == "api@6995b6f5"

    def test_parent_session(self, workspace, key):
        parent, _, _ = register(key, workspace, external_id="parent-1")
        child, _, _ = register(key, workspace, external_id="child-1", parent_external_id="parent-1")
        assert child.parent_id == parent.id

    def test_a_human_key_cannot_register(self, workspace, create_user):
        human = APIToken.objects.create(user=create_user, workspace=workspace)
        with pytest.raises(SessionError) as error:
            register(human, workspace)
        assert error.value.forbidden

    def test_a_session_token_cannot_register(self, workspace, key):
        _, token, _ = register(key, workspace)
        with pytest.raises(SessionError) as error:
            register(token, workspace, external_id="another")
        assert error.value.forbidden

    def test_a_bot_of_another_workspace_cannot_register(self, workspace, key, create_user):
        other = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws")
        WorkspaceMember.objects.create(workspace=other, member=create_user, role=20)
        with pytest.raises(SessionError) as error:
            register(key, other)
        assert error.value.forbidden

    @pytest.mark.parametrize(
        "data",
        [
            {"harness": "emacs"},
            {"external_id": ""},
            {"external_id": "x" * 256},
            {"primary_dir": 7},
            {"generation": -1},
            {"generation": True},
        ],
    )
    def test_bad_input(self, workspace, key, data):
        with pytest.raises(SessionError) as error:
            register(key, workspace, **data)
        assert not error.value.forbidden
        assert not AgentSession.objects.exists()


@pytest.mark.unit
@pytest.mark.django_db
class TestLifecycle:
    def test_end_revokes_every_token(self, workspace, key):
        session, token, _ = register(key, workspace)
        agent_sessions.end(session, reason="exit")
        session.refresh_from_db()
        assert (session.status, session.end_reason) == ("ended", "exit")
        assert session.ended_at is not None
        assert not APIToken.objects.get(pk=token.pk).is_active
        assert APIToken.objects.get(pk=key.pk).is_active

    def test_touch_writes_at_most_once_a_minute(self, workspace, key):
        session, _, _ = register(key, workspace)
        seen = session.last_seen_at
        agent_sessions.touch(session)
        assert AgentSession.objects.get(pk=session.pk).last_seen_at == seen
        agent_sessions.touch(session, force=True)
        assert AgentSession.objects.get(pk=session.pk).last_seen_at > seen

    def test_touch_brings_an_away_session_back(self, workspace, key):
        session, _, _ = register(key, workspace)
        AgentSession.objects.filter(pk=session.pk).update(status="away")
        session.refresh_from_db()
        agent_sessions.touch(session)
        assert AgentSession.objects.get(pk=session.pk).status == "live"

    def test_sweep(self, workspace, key):
        quiet, quiet_token, _ = register(key, workspace, external_id="quiet")
        gone, gone_token, _ = register(key, workspace, external_id="gone")
        busy, _, _ = register(key, workspace, external_id="busy")
        now = timezone.now()
        AgentSession.objects.filter(pk=quiet.pk).update(last_seen_at=now - timedelta(minutes=31))
        AgentSession.objects.filter(pk=gone.pk).update(status="away", last_seen_at=now - timedelta(hours=3))

        assert agent_sessions.sweep(now) == (1, 1)
        statuses = dict(AgentSession.objects.values_list("external_id", "status"))
        assert statuses == {"quiet": "away", "gone": "ended", "busy": "live"}
        assert APIToken.objects.get(pk=quiet_token.pk).is_active
        assert not APIToken.objects.get(pk=gone_token.pk).is_active

    def test_ended_sessions_are_deleted_after_the_retention_window(self, workspace, key):
        old, old_token, _ = register(key, workspace, external_id="old")
        recent, _, _ = register(key, workspace, external_id="recent")
        live, _, _ = register(key, workspace, external_id="live")
        for session in (old, recent):
            agent_sessions.end(session)
        now = timezone.now()
        AgentSession.objects.filter(pk=old.pk).update(ended_at=now - timedelta(days=8))
        AgentSession.objects.filter(pk=recent.pk).update(ended_at=now - timedelta(days=1))

        delete_ended_agent_sessions()

        assert set(AgentSession.all_objects.values_list("external_id", flat=True)) == {"recent", "live"}
        assert not APIToken.objects.filter(pk=old_token.pk).exists()


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Sessions", identifier="SES", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    bots.add_to_project(bot, project, 15)
    return project


@pytest.mark.unit
@pytest.mark.django_db
class TestAttribution:
    def test_the_publisher_stamps_the_session_into_the_activity_task(self, workspace, key):
        session, _, _ = register(key, workspace)
        request = SimpleNamespace(agent_session=session)
        body = ((), {"type": "issue.activity.created"}, {})
        with mock.patch("plane.utils.agent_session_context.get_current_request", return_value=request):
            stamp_agent_session(sender=ACTIVITY_TASK, body=body)
            other = ((), {}, {})
            stamp_agent_session(sender="plane.bgtasks.other.task", body=other)
        assert body[1]["agent_session_id"] == str(session.id)
        assert "agent_session_id" not in other[1]

    def test_no_session_no_stamp(self):
        body = ((), {}, {})
        with mock.patch("plane.utils.agent_session_context.get_current_request", return_value=None):
            stamp_agent_session(sender=ACTIVITY_TASK, body=body)
        assert body[1] == {}

    def test_acting_as_is_scoped(self):
        assert active_session_id() is None
        with acting_as("abc"):
            assert active_session_id() == "abc"
        assert active_session_id() is None

    def test_activities_of_a_session_carry_it(self, workspace, project, key, bot):
        session, _, _ = register(key, workspace)
        issue = Issue.objects.create(name="From a session", project=project, created_by=bot.user)
        issue_activity(
            type="issue.activity.created",
            requested_data=json.dumps({"name": "From a session"}),
            current_instance=None,
            issue_id=str(issue.id),
            actor_id=str(bot.user_id),
            project_id=str(project.id),
            epoch=1,
            agent_session_id=str(session.id),
        )
        activities = IssueActivity.objects.filter(issue=issue)
        assert activities.exists()
        assert set(activities.values_list("agent_session_id", flat=True)) == {session.id}

    def test_activities_without_a_session_stay_unattributed(self, project, bot):
        issue = Issue.objects.create(name="By hand", project=project, created_by=bot.user)
        issue_activity(
            type="issue.activity.created",
            requested_data=json.dumps({"name": "By hand"}),
            current_instance=None,
            issue_id=str(issue.id),
            actor_id=str(bot.user_id),
            project_id=str(project.id),
            epoch=1,
        )
        assert set(IssueActivity.objects.filter(issue=issue).values_list("agent_session_id", flat=True)) == {None}

    def test_a_comment_written_in_a_session_carries_it(self, workspace, project, key, bot):
        session, _, _ = register(key, workspace)
        issue = Issue.objects.create(name="Commented", project=project, created_by=bot.user)
        with acting_as(session.id):
            comment = IssueComment.objects.create(
                issue=issue, project=project, comment_html="<p>hi</p>", actor=bot.user
            )
        assert comment.agent_session_id == session.id

    def test_the_api_log_carries_the_session(self, workspace, key):
        session, token, _ = register(key, workspace)
        request = RequestFactory().get("/api/v1/x/", HTTP_X_API_KEY=token.token)
        request.agent_session = session
        response = SimpleNamespace(status_code=200, content=b"{}")
        middleware = APITokenLogMiddleware(lambda r: response)
        with mock.patch("plane.middleware.logger.process_logs.delay") as delay:
            middleware.process_request(request, response, b"")
            del request.agent_session
            middleware.process_request(request, response, b"")
        with_session, without = (call.kwargs["log_data"] for call in delay.call_args_list)
        assert with_session["agent_session_id"] == str(session.id)
        assert "agent_session_id" not in without

        assert log_to_postgres(with_session)
        assert APIActivityLog.objects.get().agent_session_id == session.id
