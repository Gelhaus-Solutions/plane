# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent inboxes (E28, D18): mentions of a session or a bot and comments on held items reach the right inbox once,
in order, and stay until acknowledged."""

import uuid

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import AgentInboxMessage, Issue, IssueComment, Project, ProjectMember
from plane.utils import agent_inbox, agent_sessions, bots


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Inbox", identifier="INB", workspace=workspace, created_by=create_user)
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


def chip(entity_name, ident):
    return (
        f'<mention-component id="{uuid.uuid4()}" entity_identifier="{ident}" entity_name="{entity_name}">'
        "</mention-component>"
    )


def comment(item, user, html, agent_session=None):
    return IssueComment.objects.create(
        issue=item,
        project=item.project,
        actor=user,
        comment_html=html,
        created_by=user,
        agent_session=agent_session,
    )


def inbox_url(workspace, one, tail=""):
    return f"/api/v1/workspaces/{workspace.slug}/agent-sessions/{getattr(one, 'id', one)}/inbox/{tail}"


def claim_url(workspace, item):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{item.project_id}/work-items/{item.id}/claim/"


@pytest.mark.contract
class TestInbox:
    @pytest.mark.django_db
    def test_a_mention_of_a_session_reaches_that_session_until_it_acks(self, bot, workspace, item, create_user):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222", "/Users/x/Git-Repos/ops")
        comment(item, create_user, f"<p>{chip('agent_session_mention', first.id)} please review the plan</p>")

        listed = first_client.get(inbox_url(workspace, first))
        assert listed.status_code == status.HTTP_200_OK, listed.content
        [message] = listed.json()["results"]
        assert message["kind"] == "mention" and message["to"] == "session" and message["seq"] >= 1
        assert message["work_item"]["identifier"] == f"INB-{item.sequence_id}"
        assert "please review the plan" in message["body"] and f"INB-{item.sequence_id}" in message["body"]
        assert message["actor"]["display_name"] == create_user.display_name
        assert second_client.get(inbox_url(workspace, second)).json()["results"] == []

        acked = first_client.post(inbox_url(workspace, first, "ack/"), {"ids": [message["id"]]}, format="json")
        assert acked.status_code == status.HTTP_200_OK and acked.json() == {"acked": 1}
        assert first_client.post(
            inbox_url(workspace, first, "ack/"), {"ids": [message["id"]]}, format="json"
        ).json() == {"acked": 0}
        assert first_client.get(inbox_url(workspace, first)).json()["results"] == []
        again = first_client.get(inbox_url(workspace, first), {"include_acked": "true"}).json()["results"]
        assert [m["id"] for m in again] == [message["id"]] and again[0]["acked_at"]

    @pytest.mark.django_db
    def test_a_mention_of_the_bot_is_a_queue_message_the_first_to_ack_takes(self, bot, workspace, item, create_user):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222")
        comment(item, create_user, f"<p>{chip('user_mention', bot.user_id)} who is free?</p>")

        for client, one in ((first_client, first), (second_client, second)):
            [message] = client.get(inbox_url(workspace, one)).json()["results"]
            assert message["to"] == "queue" and "mentioned Claude" in message["body"]
        taken = first_client.post(inbox_url(workspace, first, "ack/"), {"through": message["seq"]}, format="json")
        assert taken.json() == {"acked": 1}
        assert second_client.get(inbox_url(workspace, second)).json()["results"] == []
        assert AgentInboxMessage.objects.get().acked_by_id == first.id

    @pytest.mark.django_db
    def test_a_session_never_hears_its_own_words(self, bot, workspace, item, create_user):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222")
        comment(item, bot.user, f"<p>{chip('user_mention', bot.user_id)} note for whoever is next</p>", first)
        comment(item, bot.user, f"<p>{chip('agent_session_mention', first.id)} talking to myself</p>", first)
        assert first_client.get(inbox_url(workspace, first)).json()["results"] == []
        [message] = second_client.get(inbox_url(workspace, second)).json()["results"]
        assert message["from_session"]["name"] == first.name and "note for whoever is next" in message["body"]

    @pytest.mark.django_db
    def test_comments_on_a_held_item_reach_the_holder_once(self, bot, workspace, project, item, create_user):
        holder, holder_client = session(bot, workspace, "aaaaaaaa-1111")
        other, other_client = session(bot, workspace, "bbbbbbbb-2222")
        assert holder_client.post(claim_url(workspace, item)).status_code == status.HTTP_201_CREATED

        comment(item, create_user, "<p>How is it going?</p>")
        comment(item, create_user, f"<p>{chip('agent_session_mention', holder.id)} and a direct ask</p>")
        comment(item, bot.user, "<p>my own progress note</p>", holder)
        comment(item, bot.user, "<p>another session chimes in</p>", other)

        got = holder_client.get(inbox_url(workspace, holder)).json()["results"]
        assert [(m["kind"], m["body"].split("\n\n")[1]) for m in got] == [
            ("comment", "How is it going?"),
            ("mention", "and a direct ask"),
            ("comment", "another session chimes in"),
        ]
        assert [m["seq"] for m in got] == sorted(m["seq"] for m in got)
        assert other_client.get(inbox_url(workspace, other)).json()["results"] == []

        # An edit saves the comment again; nothing is told twice
        edited = IssueComment.objects.get(comment_stripped="How is it going?")
        edited.comment_html = "<p>How is it going, really?</p>"
        edited.save()
        assert len(holder_client.get(inbox_url(workspace, holder)).json()["results"]) == 3

        # Releasing the claim stops the comments
        holder_client.delete(claim_url(workspace, item))
        comment(item, create_user, "<p>Anything?</p>")
        assert len(holder_client.get(inbox_url(workspace, holder)).json()["results"]) == 3

    @pytest.mark.django_db
    def test_pages_and_cursors(self, bot, workspace, item, create_user):
        one, client = session(bot, workspace, "aaaaaaaa-1111")
        for n in range(5):
            comment(item, create_user, f"<p>{chip('agent_session_mention', one.id)} number {n}</p>")
        page = client.get(inbox_url(workspace, one), {"limit": 2}).json()
        assert [m["body"].split("\n\n")[1] for m in page["results"]] == ["number 0", "number 1"]
        assert page["has_more"] and page["cursor"] == page["results"][-1]["seq"]
        rest = client.get(inbox_url(workspace, one), {"after": page["cursor"], "limit": 100}).json()
        assert [m["body"].split("\n\n")[1] for m in rest["results"]] == ["number 2", "number 3", "number 4"]
        assert not rest["has_more"]
        empty = client.get(inbox_url(workspace, one), {"after": rest["cursor"]}).json()
        assert empty["results"] == [] and empty["cursor"] == rest["cursor"]

        assert client.post(inbox_url(workspace, one, "ack/"), {"through": page["cursor"]}, format="json").json() == {
            "acked": 2
        }
        left = client.get(inbox_url(workspace, one)).json()["results"]
        assert [m["body"].split("\n\n")[1] for m in left] == ["number 2", "number 3", "number 4"]
        assert client.post(inbox_url(workspace, one, "ack/"), {}, format="json").status_code == 400
        assert client.post(inbox_url(workspace, one, "ack/"), {"ids": ["nope"]}, format="json").status_code == 400

    @pytest.mark.django_db
    def test_a_mention_of_an_ended_session_goes_to_the_queue(self, bot, workspace, item, create_user):
        gone, _ = session(bot, workspace, "aaaaaaaa-1111")
        agent_sessions.end(gone)
        next_one, next_client = session(bot, workspace, "bbbbbbbb-2222")
        comment(item, create_user, f"<p>{chip('agent_session_mention', gone.id)} are you there?</p>")
        [message] = next_client.get(inbox_url(workspace, next_one)).json()["results"]
        assert message["to"] == "queue" and "which has ended" in message["body"]

    @pytest.mark.django_db
    def test_nothing_is_delivered_for_strangers(self, bot, workspace, project, item, create_user, api_key_client):
        outsider = bots.create_bot(workspace, "Codex", created_by=create_user)  # not a member of the project
        stranger = bots.system_bot(workspace)
        comment(
            item,
            create_user,
            f"<p>{chip('user_mention', outsider.user_id)} {chip('user_mention', stranger.user_id)}"
            f" {chip('user_mention', create_user.id)} {chip('agent_session_mention', 'not-an-id')}</p>",
        )
        assert AgentInboxMessage.objects.count() == 0

    @pytest.mark.django_db
    def test_who_may_read_an_inbox(self, bot, workspace, item, create_user, api_key_client):
        first, first_client = session(bot, workspace, "aaaaaaaa-1111")
        second, second_client = session(bot, workspace, "bbbbbbbb-2222")
        comment(item, create_user, f"<p>{chip('agent_session_mention', first.id)} hello</p>")
        assert second_client.get(inbox_url(workspace, first)).status_code == status.HTTP_403_FORBIDDEN
        assert (
            second_client.post(inbox_url(workspace, first, "ack/"), {"through": 99}, format="json").status_code == 403
        )
        bot_client = APIClient()
        bot_client.credentials(HTTP_X_API_KEY=bots.issue_token(bot, label="bot").token)
        assert len(bot_client.get(inbox_url(workspace, first)).json()["results"]) == 1
        assert api_key_client.get(inbox_url(workspace, uuid.uuid4())).status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_sequence_numbers_follow_delivery(self, bot, workspace, item, create_user):
        one, _ = session(bot, workspace, "aaaaaaaa-1111")
        first = agent_inbox.deliver(
            workspace_id=workspace.id, bot=bot, session=one, kind="mention", dedupe_key="k1", body="a"
        )
        second = agent_inbox.deliver(
            workspace_id=workspace.id, bot=bot, session=None, kind="mention", dedupe_key="k2", body="b"
        )
        assert second.seq == first.seq + 1
        assert (
            agent_inbox.deliver(workspace_id=workspace.id, bot=bot, session=one, kind="mention", dedupe_key="k1")
            is None
        )

    @pytest.mark.django_db
    def test_a_description_that_mentions_a_session_is_told_once(self, bot, workspace, project, create_user):
        one, client = session(bot, workspace, "aaaaaaaa-1111")
        made = Issue.objects.create(
            name="Look into this",
            project=project,
            created_by=create_user,
            description_html=f"<p>{chip('agent_session_mention', one.id)} take the first pass</p>",
        )
        [message] = client.get(inbox_url(workspace, one)).json()["results"]
        assert message["kind"] == "mention" and message["work_item"]["id"] == str(made.id)
        assert "take the first pass" in message["body"]

        made.name = "Look into this soon"
        made.save()
        made.description_html = f"<p>{chip('agent_session_mention', one.id)} take the second pass</p>"
        made.save()
        assert len(client.get(inbox_url(workspace, one), {"include_acked": "true"}).json()["results"]) == 1

        Issue.objects.create(
            name="For the queue",
            project=project,
            created_by=create_user,
            description_html=f"<p>{chip('user_mention', bot.user_id)} anyone?</p>",
        )
        assert [m["to"] for m in client.get(inbox_url(workspace, one)).json()["results"]] == ["session", "queue"]
