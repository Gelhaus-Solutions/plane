# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agents on work items (E28 item 4, D17, D20, D21, D26): a bot's queue, a named session, a delegate next to a
human, and handover to the next session in the same directory."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import AgentInboxMessage, Issue, IssueAssignee, Project, ProjectMember, State
from plane.utils import agent_sessions, bots


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Assign", identifier="ASG", workspace=workspace, created_by=create_user)
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
    client.credentials(HTTP_X_API_KEY=token.token)
    return made, client


def base(workspace, item):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{item.project_id}/work-items/{item.id}/"


def work_url(workspace, one):
    return f"/api/v1/workspaces/{workspace.slug}/agent-sessions/{one.id}/work/"


def inbox(client, workspace, one):
    return client.get(f"/api/v1/workspaces/{workspace.slug}/agent-sessions/{one.id}/inbox/").json()["results"]


@pytest.mark.contract
class TestAgentAssignments:
    @pytest.mark.django_db
    def test_a_bot_with_no_session_is_a_queue_and_a_claim_takes_from_it(self, bot, workspace, item, api_key_client):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222", "/Users/x/Git-Repos/ops")

        made = api_key_client.post(base(workspace, item) + "agents/", {"bot": str(bot.id)}, format="json")
        assert made.status_code == status.HTTP_200_OK, made.content
        [agent] = made.json()["agents"]
        assert agent["state"] == "queue" and agent["session"] is None and agent["bot"]["display_name"] == "Claude"

        for client, one in ((first_client, first), (second_client, second)):
            work = client.get(work_url(workspace, one)).json()
            assert work["assigned"] == [] and [w["identifier"] for w in work["queue"]] == [f"ASG-{item.sequence_id}"]
            [told] = inbox(client, workspace, one)
            assert told["kind"] == "assignment" and told["to"] == "queue" and "Claude's queue" in told["body"]

        first_client.post(base(workspace, item) + "claim/")
        assert second_client.get(work_url(workspace, second)).json()["queue"] == []

        # The same request again changes nothing and tells nobody
        again = api_key_client.post(base(workspace, item) + "agents/", {"bot": str(bot.user_id)}, format="json")
        assert again.status_code == status.HTTP_200_OK
        assert AgentInboxMessage.objects.filter(kind="assignment").count() == 1

    @pytest.mark.django_db
    def test_an_assignee_row_can_name_a_session(self, bot, workspace, item, api_key_client):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222")
        api_key_client.post(base(workspace, item) + "agents/", {"bot": str(bot.id)}, format="json")
        made = api_key_client.post(base(workspace, item) + "agents/", {"session": str(first.id)}, format="json")
        assert made.status_code == status.HTTP_200_OK, made.content
        assert made.json()["agents"][0]["state"] == "session" and made.json()["agents"][0]["session"]["id"] == str(
            first.id
        )
        assert IssueAssignee.objects.get(issue=item).agent_session_id == first.id  # the queue row became the session's

        work = first_client.get(work_url(workspace, first)).json()
        assert [w["identifier"] for w in work["assigned"]] == [f"ASG-{item.sequence_id}"] and work["queue"] == []
        assert second_client.get(work_url(workspace, second)).json() == {"assigned": [], "queue": []}
        kinds = [(m["kind"], m["to"]) for m in inbox(first_client, workspace, first)]
        assert kinds == [("assignment", "queue"), ("assignment", "session")]
        assert [m["to"] for m in inbox(second_client, workspace, second)] == ["queue"]

    @pytest.mark.django_db
    def test_a_delegate_works_next_to_the_human_assignee(self, bot, workspace, item, create_user, api_key_client):
        IssueAssignee.objects.create(issue=item, project=item.project, assignee=create_user)
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        made = api_key_client.post(
            base(workspace, item) + "agents/", {"bot": str(bot.id), "delegate": True}, format="json"
        )
        assert made.status_code == status.HTTP_200_OK and made.json()["agents"][0]["delegated"] is True
        assert IssueAssignee.objects.filter(issue=item).count() == 2  # the human stays
        [row] = first_client.get(work_url(workspace, first)).json()["queue"]
        assert row["delegated"] is True
        assert "delegated" in inbox(first_client, workspace, first)[0]["body"]
        assert api_key_client.get(base(workspace, item) + "agents/").json()["agents"][0]["delegated"] is True

        gone = api_key_client.delete(base(workspace, item) + "agents/", {"bot": str(bot.id)}, format="json")
        assert gone.status_code == status.HTTP_200_OK and gone.json() == {"agents": []}
        assert IssueAssignee.objects.filter(issue=item).count() == 1

    @pytest.mark.django_db
    def test_what_cannot_be_assigned(self, bot, workspace, project, item, create_user, api_key_client):
        outsider = bots.create_bot(workspace, "Codex", created_by=create_user)
        other, _ = session(outsider, workspace, "cccccccc-3333")
        gone, _ = session(bot, workspace, "dddddddd-4444")
        agent_sessions.end(gone)
        url = base(workspace, item) + "agents/"
        assert api_key_client.post(url, {}, format="json").status_code == 400
        assert api_key_client.post(url, {"bot": "nope"}, format="json").status_code == 400
        refused = api_key_client.post(url, {"bot": str(outsider.id)}, format="json")
        assert refused.status_code == 400 and "not a member of this project" in refused.json()["error"]
        refused = api_key_client.post(url, {"bot": str(bot.id), "session": str(other.id)}, format="json")
        assert refused.status_code == 400 and "not a session of Claude" in refused.json()["error"]
        refused = api_key_client.post(url, {"session": str(gone.id)}, format="json")
        assert refused.status_code == 400 and "has ended" in refused.json()["error"]
        assert api_key_client.post(url, {"bot": str(bot.id), "delegate": "yes"}, format="json").status_code == 400
        assert api_key_client.delete(url).status_code == 400
        assert IssueAssignee.objects.filter(issue=item).count() == 0

    @pytest.mark.django_db
    def test_a_new_session_in_the_same_directory_is_handed_the_open_items(
        self, bot, workspace, project, item, create_user, api_key_client
    ):
        done = State.objects.create(name="Finished", group="completed", project=project, workspace=workspace)
        closed = Issue.objects.create(name="Closed work", project=project, created_by=create_user, state=done)
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        elsewhere, elsewhere_client = session(bot, workspace, "bbbbbbbb-2222", "/Users/x/Git-Repos/ops")
        for one in (item, closed):
            api_key_client.post(base(workspace, one) + "agents/", {"session": str(first.id)}, format="json")
        agent_sessions.end(first)

        waiting = api_key_client.get(base(workspace, item) + "agents/").json()["agents"][0]
        assert waiting["state"] == "waiting" and waiting["session"]["status"] == "ended"
        assert first_client.get(work_url(workspace, first)).status_code in (401, 403)  # its token is revoked
        assert elsewhere_client.get(work_url(workspace, elsewhere)).json() == {"assigned": [], "queue": []}

        second, second_client = session(bot, workspace, "eeeeeeee-5555")
        assert IssueAssignee.objects.get(issue=item).agent_session_id == second.id
        assert IssueAssignee.objects.get(issue=closed).agent_session_id == first.id  # closed work stays behind
        [handover] = [m for m in inbox(second_client, workspace, second) if m["kind"] == "handover"]
        assert handover["data"]["items"][0]["identifier"] == f"ASG-{item.sequence_id}"
        assert handover["data"]["from_sessions"] == [first.name] and "Shared work" in handover["body"]
        assert api_key_client.get(base(workspace, item) + "agents/").json()["agents"][0]["state"] == "session"
        assert [w["name"] for w in second_client.get(work_url(workspace, second)).json()["assigned"]] == ["Shared work"]
        # Nothing is handed over twice
        third, third_client = session(bot, workspace, "ffffffff-6666")
        assert [m for m in inbox(third_client, workspace, third) if m["kind"] == "handover"] == []
