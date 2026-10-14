# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The web's view of agents (D46): the workspace's sessions for the pickers, live first with what they hold, and
assigning or delegating from the web through the agents path, so the session hears it."""

import pytest
from rest_framework import status

from plane.db.models import AgentInboxMessage, AgentSession, Issue, IssueAssignee, Project, ProjectMember
from plane.utils import agent_sessions, bots


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Agents", identifier="AGT", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    bots.add_to_project(bot, project, 15)
    return project


@pytest.fixture
def item(project, create_user):
    return Issue.objects.create(name="Shared work", project=project, created_by=create_user)


def register(bot, workspace, external_id, primary_dir="/Users/x/Git-Repos/plane"):
    key = bots.issue_token(bot, label="claude")
    made, _, _ = agent_sessions.register(
        key, workspace, {"harness": "claude-code", "external_id": external_id, "primary_dir": primary_dir}
    )
    return made


def agents_url(workspace, item):
    return f"/api/workspaces/{workspace.slug}/projects/{item.project_id}/issues/{item.id}/agents/"


@pytest.mark.contract
class TestWorkspaceSessions:
    @pytest.mark.django_db
    def test_live_sessions_come_first_with_what_they_hold(self, session_client, workspace, bot, item):
        away = register(bot, workspace, "aaaaaaaa-1111", "/Users/x/Git-Repos/ops")
        AgentSession.objects.filter(pk=away.pk).update(status=AgentSession.Status.AWAY)
        live = register(bot, workspace, "bbbbbbbb-2222")
        ended = register(bot, workspace, "cccccccc-3333")
        agent_sessions.end(ended)
        agent_sessions.claim(item, live)

        response = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/")
        assert response.status_code == status.HTTP_200_OK, response.content
        rows = response.json()["results"]
        assert [row["id"] for row in rows] == [str(live.id), str(away.id)]
        assert rows[0]["bot"]["user_id"] == str(bot.user_id)
        assert [held["identifier"] for held in rows[0]["holds"]] == [f"AGT-{item.sequence_id}"]

        ended_only = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/?status=ended").json()
        assert [row["id"] for row in ended_only["results"]] == [str(ended.id)]


@pytest.mark.contract
class TestWorkItemAgents:
    @pytest.mark.django_db
    def test_assigning_a_session_from_the_web_tells_it(self, session_client, workspace, bot, item):
        live = register(bot, workspace, "bbbbbbbb-2222")
        response = session_client.post(agents_url(workspace, item), {"session": str(live.id)}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.content
        [agent] = response.json()["agents"]
        assert agent["state"] == "session" and agent["session"]["name"] == live.name and not agent["delegated"]
        told = AgentInboxMessage.objects.get(kind="assignment")
        assert told.session_id == live.id

    @pytest.mark.django_db
    def test_delegating_keeps_the_human_and_delete_takes_the_bot_off(
        self, session_client, workspace, bot, item, create_user
    ):
        IssueAssignee.objects.create(
            issue=item, assignee=create_user, project_id=item.project_id, workspace_id=item.workspace_id
        )
        response = session_client.post(
            agents_url(workspace, item), {"bot": str(bot.user_id), "delegate": True}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.content
        [agent] = response.json()["agents"]
        assert agent["state"] == "queue" and agent["delegated"]
        assert IssueAssignee.objects.filter(issue=item, assignee=create_user).exists()

        gone = session_client.delete(agents_url(workspace, item) + f"?bot={bot.user_id}")
        assert gone.status_code == status.HTTP_200_OK and gone.json()["agents"] == []
        assert IssueAssignee.objects.filter(issue=item, assignee=create_user).exists()

    @pytest.mark.django_db
    def test_a_bot_outside_the_project_is_refused(self, session_client, workspace, create_user, item):
        other = bots.create_bot(workspace, "Codex", created_by=create_user)
        response = session_client.post(agents_url(workspace, item), {"bot": str(other.user_id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not a member" in response.json()["error"]


def issue_url(workspace, item):
    return f"/api/workspaces/{workspace.slug}/projects/{item.project_id}/issues/{item.id}/"


@pytest.mark.contract
class TestAssigneeEdits:
    """The web's assignee pickers send the whole list (``assignee_ids``); what an agent row names must survive it."""

    @pytest.mark.django_db
    def test_an_edit_keeps_the_session_a_bot_row_names(self, session_client, workspace, bot, item, create_user):
        live = register(bot, workspace, "bbbbbbbb-2222")
        session_client.post(agents_url(workspace, item), {"session": str(live.id)}, format="json")
        assert AgentInboxMessage.objects.filter(kind="assignment").count() == 1

        response = session_client.patch(
            issue_url(workspace, item), {"assignee_ids": [str(bot.user_id), str(create_user.id)]}, format="json"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT, response.content
        row = IssueAssignee.objects.get(issue=item, assignee=bot.user)
        assert row.agent_session_id == live.id
        assert IssueAssignee.objects.filter(issue=item, assignee=create_user).exists()
        assert AgentInboxMessage.objects.filter(kind="assignment").count() == 1

    @pytest.mark.django_db
    def test_an_edit_leaves_a_delegation_to_the_agents_path(self, session_client, workspace, bot, item, create_user):
        session_client.post(agents_url(workspace, item), {"bot": str(bot.user_id), "delegate": True}, format="json")
        # the picker lists people and queue bots, never a delegation, so the edit it sends has no delegate in it
        session_client.patch(issue_url(workspace, item), {"assignee_ids": [str(create_user.id)]}, format="json")
        assert IssueAssignee.objects.get(issue=item, assignee=bot.user).delegated
        assert IssueAssignee.objects.filter(issue=item, assignee=create_user).exists()

        gone = session_client.delete(agents_url(workspace, item) + f"?bot={bot.user_id}")
        assert gone.status_code == status.HTTP_200_OK and gone.json()["agents"] == []

    @pytest.mark.django_db
    def test_adding_a_bot_through_assignee_ids_tells_its_queue_once(self, session_client, workspace, bot, item):
        for _ in range(2):
            response = session_client.patch(
                issue_url(workspace, item), {"assignee_ids": [str(bot.user_id)]}, format="json"
            )
            assert response.status_code == status.HTTP_204_NO_CONTENT, response.content
        [told] = AgentInboxMessage.objects.filter(kind="assignment")
        assert told.session_id is None and told.bot_id == bot.id
        assert told.issue_id == item.id


@pytest.mark.contract
class TestAgentRows:
    """What the list and board rows show: per item the agents on it and the session that holds it."""

    @pytest.mark.django_db
    def test_the_listing_names_the_session_that_holds_the_item(self, session_client, workspace, bot, item):
        live = register(bot, workspace, "bbbbbbbb-2222")
        agent_sessions.claim(item, live)
        session_client.post(agents_url(workspace, item), {"bot": str(bot.user_id)}, format="json")
        data = session_client.get(agents_url(workspace, item)).json()
        assert data["claim"]["session"]["name"] == live.name
        assert data["claim"]["session"]["bot"]["display_name"] == "Claude"
        assert [agent["state"] for agent in data["agents"]] == ["queue"]

    @pytest.mark.django_db
    def test_a_project_lists_its_open_items_with_agents_or_claims(
        self, session_client, workspace, bot, project, item, create_user
    ):
        live = register(bot, workspace, "bbbbbbbb-2222")
        session_client.post(agents_url(workspace, item), {"session": str(live.id), "delegate": True}, format="json")
        claimed = Issue.objects.create(name="Held", project=project, created_by=create_user)
        agent_sessions.claim(claimed, live)
        Issue.objects.create(name="No agent", project=project, created_by=create_user)

        response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/agent-rows/")
        assert response.status_code == status.HTTP_200_OK, response.content
        by_issue = {entry["issue_id"]: entry for entry in response.json()["results"]}
        assert set(by_issue) == {str(item.id), str(claimed.id)}
        [agent] = by_issue[str(item.id)]["agents"]
        assert agent["session"]["name"] == live.name and agent["delegated"] and agent["state"] == "session"
        assert by_issue[str(claimed.id)]["agents"] == []
        assert by_issue[str(claimed.id)]["claim"]["session"]["id"] == str(live.id)
