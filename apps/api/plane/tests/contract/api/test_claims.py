# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Claims (E28, D17, D23): exclusive while the session is live, lapsing when it ends or goes away; PQL claimedBy,
session and currentSession()."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import AgentSession, Issue, IssueActivity, Project, ProjectMember, WorkItemClaim
from plane.utils import agent_sessions, bots


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Claims", identifier="CLM", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    bots.add_to_project(bot, project, 15)
    return project


@pytest.fixture
def item(project, create_user):
    return Issue.objects.create(name="Shared work", project=project, created_by=create_user)


def session(bot, workspace, external_id, primary_dir="/Users/x/Git-Repos/plane"):
    key = bots.issue_token(bot, label="claude")
    made, token, _ = agent_sessions.register(
        key, workspace, {"harness": "claude-code", "external_id": external_id, "primary_dir": primary_dir}
    )
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)  # the REST API takes X-Api-Key; only /mcp also takes Bearer
    return made, client


def claim_url(workspace, project, item):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/{item.id}/claim/"


@pytest.mark.contract
class TestClaims:
    @pytest.mark.django_db
    def test_one_live_holder_at_a_time(self, bot, workspace, project, item, api_key_client):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222", "/Users/x/Git-Repos/ops")
        url = claim_url(workspace, project, item)

        made = first_client.post(url)
        assert made.status_code == status.HTTP_201_CREATED, made.content
        assert made.json()["claim"]["label"] == "Claude · plane@aaaaaaaa"
        assert first_client.post(url).status_code == status.HTTP_200_OK  # claiming again is fine

        refused = second_client.post(url)
        assert refused.status_code == status.HTTP_409_CONFLICT
        assert "Claimed by Claude · plane@aaaaaaaa" in refused.json()["error"]
        assert second_client.delete(url).status_code == status.HTTP_403_FORBIDDEN
        assert api_key_client.post(url).status_code == status.HTTP_403_FORBIDDEN  # people assign, sessions claim

        agent_sessions.end(first)
        assert WorkItemClaim.objects.get(session=first).end_reason == "session_ended"
        assert api_key_client.get(url).json()["claim"] is None
        assert second_client.post(url).status_code == status.HTTP_201_CREATED

        # Silent for 30 minutes: the session goes away and its claim lapses
        AgentSession.objects.filter(pk=second.pk).update(last_seen_at=timezone.now() - timedelta(minutes=31))
        agent_sessions.sweep()
        assert WorkItemClaim.objects.get(session=second).end_reason == "session_away"

    @pytest.mark.django_db
    def test_a_stale_claim_is_taken_over_and_a_person_can_release(self, bot, workspace, project, item, api_key_client):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222")
        url = claim_url(workspace, project, item)
        first_client.post(url)
        AgentSession.objects.filter(pk=first.pk).update(status=AgentSession.Status.AWAY)
        assert second_client.post(url).status_code == status.HTTP_201_CREATED
        assert WorkItemClaim.objects.get(session=first).end_reason == "lapsed"

        released = api_key_client.delete(url)
        assert (
            released.status_code == status.HTTP_200_OK
            and released.json()["claim"]["end_reason"] == "released_by_person"
        )

    @pytest.mark.django_db
    def test_pql(self, bot, workspace, project, item, create_user):
        other = Issue.objects.create(name="Free", project=project, created_by=create_user)
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        first_client.post(claim_url(workspace, project, item))
        # The activity task runs in Celery; write the row it would write for the session's change
        IssueActivity.objects.create(
            issue=other, project=project, workspace=workspace, verb="updated", field="priority", agent_session=first
        )
        url = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"

        def names(client, pql):
            response = client.get(url, {"pql": pql})
            assert response.status_code == status.HTTP_200_OK, response.content
            return sorted(r["name"] for r in response.json()["results"])

        assert names(first_client, "claimedBy = currentSession()") == ["Shared work"]
        assert names(first_client, 'claimedBy = "plane@aaaaaaaa"') == ["Shared work"]
        assert names(first_client, 'claimedBy = "Claude"') == ["Shared work"]
        assert names(first_client, "claimedBy IS EMPTY") == ["Free"]
        assert "Free" in names(first_client, "session = currentSession()")
        no_session = APIClient()
        no_session.credentials(HTTP_X_API_KEY=bots.issue_token(bot, label="key").token)
        refused = no_session.get(url, {"pql": "claimedBy = currentSession()"})
        assert refused.status_code == status.HTTP_400_BAD_REQUEST and "session" in str(refused.content)
