# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent sessions on the public API: registration with the bot key, session tokens, heartbeat, end, list."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import AgentSession, Issue, IssueComment, Project, ProjectMember
from plane.utils import bots

SESSION_ID = "6995b6f5-28a7-488f-90b6-823339d48fe1"
# A refused token: the authenticator sends no WWW-Authenticate header, so DRF answers 403 rather than 401
REFUSED = (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def bot_client(bot):
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=bots.issue_token(bot, label="claude").token)
    return client


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Sessions", identifier="SES", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    bots.add_to_project(bot, project, 15)
    return project


def url(workspace, *parts):
    return "/".join([f"/api/v1/workspaces/{workspace.slug}/agent-sessions", *map(str, parts)]) + "/"


def register(client, workspace, **data):
    payload = {
        "harness": "claude-code",
        "external_id": SESSION_ID,
        "primary_dir": "/Users/x/Git-Repos/plane",
        "host": "mac",
        "git_branch": "main",
        "model": "claude-opus-5-5",
        "harness_version": "2.1.296",
    }
    payload.update(data)
    return client.post(url(workspace), payload, format="json")


def as_session(response):
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=response.data["token"])
    return client


@pytest.mark.contract
class TestRegistration:
    @pytest.mark.django_db
    def test_the_bot_key_registers_a_session(self, bot_client, workspace, bot):
        response = register(bot_client, workspace)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["name"] == "plane@6995b6f5"
        assert response.data["status"] == "live"
        assert response.data["bot"]["user_id"] == str(bot.user_id)
        assert response.data["token"].startswith("plane_api_")
        assert response.data["git_branch"] == "main"

    @pytest.mark.django_db
    def test_registering_again_reopens_and_the_old_token_stops(self, bot_client, workspace):
        first = register(bot_client, workspace)
        again = register(bot_client, workspace)
        assert again.status_code == status.HTTP_200_OK
        assert again.data["id"] == first.data["id"]
        assert as_session(first).get(url(workspace)).status_code in REFUSED
        assert as_session(again).get(url(workspace)).status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_a_human_key_cannot_register(self, api_key_client, workspace):
        assert register(api_key_client, workspace).status_code == status.HTTP_403_FORBIDDEN
        assert not AgentSession.objects.exists()

    @pytest.mark.django_db
    def test_a_session_token_cannot_register(self, bot_client, workspace):
        session = as_session(register(bot_client, workspace))
        assert register(session, workspace, external_id="other").status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_bad_input(self, bot_client, workspace):
        response = register(bot_client, workspace, harness="vim")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "harness" in response.data["error"]


@pytest.mark.contract
class TestSessionTokens:
    @pytest.mark.django_db
    def test_writes_act_as_the_bot_and_carry_the_session(self, bot_client, workspace, project, bot):
        registered = register(bot_client, workspace)
        client = as_session(registered)
        items = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"

        created = client.post(items, {"name": "From a session"}, format="json")
        assert created.status_code == status.HTTP_201_CREATED, created.data
        issue = Issue.objects.get(pk=created.data["id"])
        assert issue.created_by_id == bot.user_id

        comment = client.post(f"{items}{issue.id}/comments/", {"comment_html": "<p>hi</p>"}, format="json")
        assert comment.status_code == status.HTTP_201_CREATED, comment.data
        assert str(IssueComment.objects.get(pk=comment.data["id"]).agent_session_id) == registered.data["id"]

    @pytest.mark.django_db
    def test_the_bot_key_still_acts_without_a_session(self, bot_client, workspace, project):
        register(bot_client, workspace)
        items = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"
        created = bot_client.post(items, {"name": "Bot itself"}, format="json")
        comment = bot_client.post(f"{items}{created.data['id']}/comments/", {"comment_html": "<p>x</p>"}, format="json")
        assert comment.status_code == status.HTTP_201_CREATED, comment.data
        assert IssueComment.objects.get(pk=comment.data["id"]).agent_session_id is None


@pytest.mark.contract
class TestLifecycle:
    @pytest.mark.django_db
    def test_heartbeat_by_the_session_or_its_bot_only(self, bot_client, workspace):
        mine = register(bot_client, workspace)
        other = register(bot_client, workspace, external_id="other-session")
        beat = url(workspace, mine.data["id"], "heartbeat")

        assert as_session(mine).post(beat).status_code == status.HTTP_200_OK
        assert bot_client.post(beat).status_code == status.HTTP_200_OK
        assert as_session(other).post(beat).status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_end_stops_the_token(self, bot_client, workspace):
        registered = register(bot_client, workspace)
        client = as_session(registered)
        ended = client.post(url(workspace, registered.data["id"], "end"), {"reason": "exit"}, format="json")
        assert ended.status_code == status.HTTP_200_OK
        assert (ended.data["status"], ended.data["end_reason"]) == ("ended", "exit")

        assert client.get(url(workspace)).status_code in REFUSED
        beat = bot_client.post(url(workspace, registered.data["id"], "heartbeat"))
        assert beat.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_members_list_and_filter(self, bot_client, api_key_client, workspace):
        live = register(bot_client, workspace)
        gone = register(bot_client, workspace, external_id="gone-session")
        bot_client.post(url(workspace, gone.data["id"], "end"))

        listed = api_key_client.get(url(workspace))
        assert listed.status_code == status.HTTP_200_OK
        assert {s["id"] for s in listed.data["results"]} == {live.data["id"], gone.data["id"]}
        assert "token" not in listed.data["results"][0]

        only_live = api_key_client.get(url(workspace) + "?status=live")
        assert [s["id"] for s in only_live.data["results"]] == [live.data["id"]]
        detail = api_key_client.get(url(workspace, gone.data["id"]))
        assert detail.data["status"] == "ended"
