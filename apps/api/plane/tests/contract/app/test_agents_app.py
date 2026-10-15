# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The web's view of agents (D46): the workspace's sessions for the pickers, live first with what they hold, and
assigning or delegating from the web through the agents path, so the session hears it."""

import pytest
from rest_framework import status

from plane.db.models import (
    AgentInboxMessage,
    AgentSession,
    Issue,
    IssueAssignee,
    IssueComment,
    Project,
    ProjectMember,
    WorkItemClaim,
    WorkspaceMember,
)
from plane.utils import agent_assignments, agent_sessions, bots


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


@pytest.mark.contract
class TestSessionCards:
    """What a session chip needs: the session behind a comment, and one session with what it holds."""

    @pytest.mark.django_db
    def test_one_session_comes_with_what_it_holds(self, session_client, workspace, bot, item):
        live = register(bot, workspace, "bbbbbbbb-2222")
        agent_sessions.claim(item, live)
        response = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/{live.id}/")
        assert response.status_code == status.HTTP_200_OK, response.content
        data = response.json()
        assert data["name"] == live.name and data["harness"] == "claude-code"
        assert [held["identifier"] for held in data["holds"]] == [f"AGT-{item.sequence_id}"]

        missing = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/{item.id}/")
        assert missing.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_a_comment_names_the_session_that_wrote_it(self, session_client, workspace, bot, item, project):
        live = register(bot, workspace, "bbbbbbbb-2222")
        IssueComment.objects.create(
            issue=item,
            project=project,
            workspace=workspace,
            actor=bot.user,
            comment_html="<p>Parser is in.</p>",
            agent_session=live,
        )
        IssueComment.objects.create(
            issue=item, project=project, workspace=workspace, actor=bot.user, comment_html="<p>Hi.</p>"
        )
        response = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{item.id}/history/"
        )
        assert response.status_code == status.HTTP_200_OK, response.content
        comments = {c["comment_stripped"]: c for c in response.json() if c.get("comment_stripped")}
        detail = comments["Parser is in."]["agent_session_detail"]
        assert detail["name"] == live.name and detail["bot"]["display_name"] == "Claude"
        assert comments["Hi."]["agent_session_detail"] is None


@pytest.mark.contract
class TestAgentsPage:
    """The Agents page (r6-03, r6-10): each bot's queue, what ended sessions handed over, and the session panel."""

    @pytest.mark.django_db
    def test_the_board_lists_queues_and_what_an_ended_session_handed_over(
        self, session_client, workspace, bot, item, project, create_user
    ):
        queued = Issue.objects.create(name="Queued work", project=project, created_by=create_user)
        agent_assignments.assign(queued, bot)
        early = register(bot, workspace, "aaaaaaaa-1111")
        agent_assignments.assign(item, bot, session=early)
        agent_sessions.claim(item, early)
        agent_sessions.end(early)
        url = f"/api/workspaces/{workspace.slug}/agent-sessions/?status=ended&board=1"

        [row] = session_client.get(url).json()["results"]
        assert [touched["identifier"] for touched in row["touched"]] == [f"AGT-{item.sequence_id}"]
        item.refresh_from_db()
        assert row["touched"][0]["state_group"] == (item.state.group if item.state_id else None)
        assert row["handoff"]["to"] is None
        assert [waiting["id"] for waiting in row["handoff"]["waiting"]] == [str(item.id)]

        later = register(bot, workspace, "bbbbbbbb-2222")
        board = session_client.get(url).json()
        [row] = board["results"]
        assert row["handoff"]["to"]["id"] == str(later.id)
        assert [handed["id"] for handed in row["handoff"]["items"]] == [str(item.id)]
        assert row["handoff"]["waiting"] == []
        [queue] = board["queues"]
        assert queue["bot"]["id"] == str(bot.user_id) and queue["count"] == 1
        assert [entry["id"] for entry in queue["items"]] == [str(queued.id)]
        queued.refresh_from_db()
        assert queue["items"][0]["state_group"] == (queued.state.group if queued.state_id else None)

        # without board=1 the listing stays what the pickers read
        plain = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/?status=ended").json()
        assert "queues" not in plain and "touched" not in plain["results"][0]

    @pytest.mark.django_db
    def test_a_person_releases_a_claim_from_the_web(self, session_client, workspace, bot, item, create_user):
        holder = register(bot, workspace, "aaaaaaaa-1111")
        agent_sessions.claim(item, holder)
        url = f"/api/workspaces/{workspace.slug}/projects/{item.project_id}/issues/{item.id}/claim/"

        response = session_client.delete(url)
        assert response.status_code == status.HTTP_200_OK, response.content
        assert response.json()["claim"] is None
        assert WorkItemClaim.objects.get(session=holder).end_reason == "released_by_person"
        # nothing to release is fine, and a guest of the project may not
        assert session_client.delete(url).status_code == status.HTTP_200_OK
        agent_sessions.claim(item, holder)
        ProjectMember.objects.filter(project_id=item.project_id, member=create_user).update(role=5)
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=5)
        assert session_client.delete(url).status_code == status.HTTP_403_FORBIDDEN
        assert agent_sessions.open_claim(item) is not None

    @pytest.mark.django_db
    def test_the_panel_shows_items_claims_handoffs_and_inbox_from_the_viewers_projects(
        self, session_client, workspace, bot, item, create_user
    ):
        early = register(bot, workspace, "aaaaaaaa-1111")
        agent_assignments.assign(item, bot, session=early)
        agent_sessions.claim(item, early)
        agent_sessions.end(early)
        later = register(bot, workspace, "bbbbbbbb-2222")
        agent_sessions.claim(item, later)
        hidden_project = Project.objects.create(
            name="Hidden", identifier="HID", workspace=workspace, created_by=create_user
        )
        hidden = Issue.objects.create(name="Not yours", project=hidden_project, created_by=create_user)
        agent_sessions.claim(hidden, later)

        url = f"/api/workspaces/{workspace.slug}/agent-sessions/{later.id}/panel/"
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK, response.content
        panel = response.json()
        assert [held["id"] for held in panel["holds"]] == [str(item.id)]
        item.refresh_from_db()
        assert panel["holds"][0]["state_group"] == (item.state.group if item.state_id else None)
        [entry] = panel["items"]
        assert entry["id"] == str(item.id) and "holds" in entry["roles"] and "assigned" in entry["roles"]
        assert [claim["item"]["id"] for claim in panel["claims"]] == [str(item.id)]
        [received] = panel["handoffs"]["received"]
        assert [source["id"] for source in received["from_sessions"]] == [str(early.id)]
        assert [handed["id"] for handed in received["items"]] == [str(item.id)]
        assert "handover" in [message["kind"] for message in panel["inbox"]]
        assert {recent["kind"] for recent in panel["recent"]} == {"claimed"}

        earlier = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/{early.id}/panel/").json()
        assert earlier["handoffs"]["given"]["to"]["id"] == str(later.id)
        [claim] = earlier["claims"]
        assert claim["end_reason"] == "session_ended" and claim["ended_at"]
