# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent steering (E29): status and plan on the claim, typed activity, questions with options, default and deadline,
the review request, Needs you, and the MCP tools that put it in an agent's hands."""

import json
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    AgentActivity,
    AgentInboxMessage,
    AgentQuestion,
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    WorkItemClaim,
    WorkspaceMember,
)
from plane.utils import agent_sessions, agent_steering, bots
from plane.utils.agent_steering import SessionError


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Claude", created_by=create_user)


@pytest.fixture
def project(db, workspace, create_user, bot):
    project = Project.objects.create(name="Steering", identifier="STR", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    bots.add_to_project(bot, project, 15)
    return project


@pytest.fixture
def item(project, create_user):
    return Issue.objects.create(name="Rotate tokens", project=project, created_by=create_user)


def session(bot, workspace, external_id, primary_dir="/Users/x/Git-Repos/plane"):
    key = bots.issue_token(bot, label="claude")
    made, token, _ = agent_sessions.register(
        key, workspace, {"harness": "claude-code", "external_id": external_id, "primary_dir": primary_dir}
    )
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)
    client.token = token.token
    return made, client


@pytest.fixture
def holder(bot, workspace, item):
    """A live session that holds the item."""
    made, client = session(bot, workspace, "aaaaaaaa-1111")
    assert client.post(url(workspace, item, "claim/")).status_code == status.HTTP_201_CREATED
    return made, client


def url(workspace, item, tail=""):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{item.project_id}/work-items/{item.id}/{tail}"


def app_url(workspace, item, tail=""):
    return f"/api/workspaces/{workspace.slug}/projects/{item.project_id}/issues/{item.id}/{tail}"


def inbox(workspace, one, client):
    response = client.get(f"/api/v1/workspaces/{workspace.slug}/agent-sessions/{one.id}/inbox/")
    assert response.status_code == status.HTTP_200_OK, response.content
    return response.json()["results"]


def ask(workspace, item, client, **body):
    body = {
        "question": "Should the old token keep working for a while?",
        "options": ["No, revoke it at once", {"label": "24 hours", "detail": "log a warning on use"}, "7 days"],
        **body,
    }
    return client.post(url(workspace, item, "questions/"), body, format="json")


@pytest.mark.contract
class TestStatusAndPlan:
    @pytest.mark.django_db
    def test_status_and_plan_belong_to_the_session_that_holds_the_claim(self, bot, workspace, item, holder):
        _, client = holder
        other, other_client = session(bot, workspace, "bbbbbbbb-2222", "/Users/x/Git-Repos/ops")
        body = {"status": "blocked", "status_text": "Waiting for the migration check"}
        refused = other_client.patch(url(workspace, item, "claim/"), body, format="json")
        assert (
            refused.status_code == status.HTTP_403_FORBIDDEN and "Claim the work item first" in refused.json()["error"]
        )

        response = client.patch(url(workspace, item, "claim/"), body, format="json")
        assert response.status_code == status.HTTP_200_OK, response.content
        claim = response.json()["claim"]
        assert claim["status"] == "blocked" and claim["status_text"] == "Waiting for the migration check"
        assert claim["plan"] == [] and claim["plan_summary"] == {"done": 0, "total": 0, "current": None}

        shown = client.get(url(workspace, item, "claim/")).json()["claim"]
        assert shown["status"] == "blocked"
        # saying the same again is not a new entry in the history
        client.patch(url(workspace, item, "claim/"), body, format="json")
        entries = AgentActivity.objects.filter(issue=item, kind="status")
        assert [entry.text for entry in entries] == ["Waiting for the migration check"]
        assert entries[0].data == {"state": "blocked"}

    @pytest.mark.django_db
    def test_status_is_refused_without_a_claim_or_a_session(self, bot, workspace, item, api_key_client):
        _, client = session(bot, workspace, "cccccccc-3333")
        response = client.patch(url(workspace, item, "claim/"), {"status": "working"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert (
            api_key_client.patch(url(workspace, item, "claim/"), {"status": "working"}, format="json").status_code
            == 403
        )

    @pytest.mark.django_db
    def test_status_is_validated(self, workspace, item, holder):
        _, client = holder
        assert client.patch(url(workspace, item, "claim/"), {}, format="json").status_code == 400
        wrong = client.patch(url(workspace, item, "claim/"), {"status": "done"}, format="json")
        assert wrong.status_code == status.HTTP_400_BAD_REQUEST and "working" in wrong.json()["error"]
        long = client.patch(url(workspace, item, "claim/"), {"status_text": "x" * 201}, format="json")
        assert long.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_the_plan_marks_the_step_in_progress(self, workspace, item, holder):
        _, client = holder
        steps = ["Tokenizer", "Precedence", "Relation functions", "Run the corpus"]
        response = client.patch(url(workspace, item, "claim/"), {"plan": steps, "plan_current": 3}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.content
        claim = response.json()["claim"]
        assert [step["state"] for step in claim["plan"]] == ["done", "done", "doing", "todo"]
        assert claim["plan_summary"] == {"done": 2, "total": 4, "current": "Relation functions"}
        [entry] = AgentActivity.objects.filter(issue=item, kind="plan")
        assert entry.text == "Step 3 of 4: Relation functions" and len(entry.data["steps"]) == 4

        # the same plan again changes nothing; one step further is a new entry
        client.patch(url(workspace, item, "claim/"), {"plan": steps, "plan_current": 3}, format="json")
        assert AgentActivity.objects.filter(issue=item, kind="plan").count() == 1
        client.patch(url(workspace, item, "claim/"), {"plan": steps, "plan_current": 5}, format="json")
        latest = AgentActivity.objects.filter(issue=item, kind="plan").first()
        assert latest.text == "4 of 4 steps done"

    @pytest.mark.django_db
    def test_a_step_can_carry_its_own_state(self, workspace, item, holder):
        _, client = holder
        plan = [{"title": "Parse", "state": "done"}, {"title": "Compile", "state": "doing"}, "Ship"]
        response = client.patch(url(workspace, item, "claim/"), {"plan": plan}, format="json")
        assert [step["state"] for step in response.json()["claim"]["plan"]] == ["done", "doing", "todo"]
        for bad in ([], "steps", [{"title": ""}], [{"title": "a", "state": "later"}], ["x"] * 31):
            refused = client.patch(url(workspace, item, "claim/"), {"plan": bad}, format="json")
            assert refused.status_code == status.HTTP_400_BAD_REQUEST, bad


@pytest.mark.contract
class TestActivityLog:
    @pytest.mark.django_db
    def test_progress_errors_commits_and_pull_requests(self, workspace, item, holder):
        _, client = holder
        notes = [
            {"kind": "progress", "text": "61 of 74 corpus cases pass"},
            {"kind": "error", "text": "3 tests fail", "ref": "test_relations.py"},
            {
                "kind": "commit",
                "text": "childOf() compiles to a subquery",
                "ref": "a41c9e2",
                "url": "https://x.test/c/a41c9e2",
            },
            {"kind": "pull_request", "text": "PQL parser and compiler", "ref": "218", "url": "https://x.test/pull/218"},
        ]
        for note in notes:
            response = client.post(url(workspace, item, "agent-activity/"), note, format="json")
            assert response.status_code == status.HTTP_201_CREATED, response.content
        listed = client.get(url(workspace, item, "agent-activity/")).json()["results"]
        assert [entry["kind"] for entry in listed] == ["pull_request", "commit", "error", "progress"]
        assert listed[0]["data"] == {"ref": "218", "url": "https://x.test/pull/218"}
        assert listed[0]["session"]["name"] == "plane@aaaaaaaa"
        errors = client.get(url(workspace, item, "agent-activity/?kind=error")).json()["results"]
        assert [entry["text"] for entry in errors] == ["3 tests fail"]

    @pytest.mark.django_db
    def test_a_note_is_checked(self, workspace, item, holder, api_key_client):
        _, client = holder
        path = url(workspace, item, "agent-activity/")
        assert client.post(path, {"kind": "status", "text": "x"}, format="json").status_code == 400
        assert client.post(path, {"kind": "error"}, format="json").status_code == 400
        assert (
            client.post(path, {"kind": "commit", "text": "x", "url": "javascript:alert(1)"}, format="json").status_code
            == 400
        )
        assert api_key_client.post(path, {"kind": "progress", "text": "x"}, format="json").status_code == 403
        assert AgentActivity.objects.filter(issue=item).count() == 0


@pytest.mark.contract
class TestReview:
    @pytest.mark.django_db
    def test_requesting_review_moves_the_item_to_review(self, workspace, item, holder):
        _, client = holder
        response = client.post(url(workspace, item, "review/"), {"text": "Rotation works, tests pass"}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.content
        assert response.json()["moved"] is True and response.json()["state"]["name"] == "Review"
        item.refresh_from_db()
        assert item.state.name == "Review" and item.state.state_group.key == "review"
        claim = WorkItemClaim.objects.get(issue=item, ended_at__isnull=True)
        assert claim.status == "waiting_for_review" and claim.status_text == "Rotation works, tests pass"
        [entry] = AgentActivity.objects.filter(issue=item, kind="review")
        assert entry.text == "Rotation works, tests pass" and entry.data["moved"] is True

        again = client.post(url(workspace, item, "review/"), {}, format="json")
        assert again.status_code == 200 and again.json()["moved"] is False

    @pytest.mark.django_db
    def test_a_closed_item_cannot_be_sent_to_review(self, workspace, item, holder, project):
        _, client = holder
        done = State.objects.create(project=project, name="Done", group="completed")
        Issue.objects.filter(pk=item.pk).update(state=done)
        response = client.post(url(workspace, item, "review/"), {}, format="json")
        assert response.status_code == status.HTTP_409_CONFLICT and "already closed" in response.json()["error"]

    @pytest.mark.django_db
    def test_a_person_with_no_session_cannot_request_review_for_an_agent(self, workspace, item, api_key_client):
        response = api_key_client.post(url(workspace, item, "review/"), {}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestQuestions:
    @pytest.mark.django_db
    def test_a_question_round_trip(self, bot, workspace, item, holder, session_client):
        made, client = holder
        asked = ask(workspace, item, client, default=2, deadline_minutes=60, detail="Scripts break on rotate")
        assert asked.status_code == status.HTTP_201_CREATED, asked.content
        question = asked.json()
        assert question["status"] == "open" and question["default_option"] == 2 and question["deadline"]
        assert [option["label"] for option in question["options"]] == ["No, revoke it at once", "24 hours", "7 days"]
        assert question["options"][1]["detail"] == "log a warning on use" and question["options"][0]["detail"] == ""
        assert (
            question["session"]["name"] == "plane@aaaaaaaa"
            and question["work_item"]["identifier"] == f"STR-{item.sequence_id}"
        )

        overview = session_client.get(app_url(workspace, item, "agent-activity/")).json()
        assert overview["awaiting_input"] is True and [q["id"] for q in overview["questions"]] == [question["id"]]
        needs = session_client.get(f"/api/workspaces/{workspace.slug}/needs-you/").json()
        assert needs["counts"] == {"questions": 1, "reviews": 0, "total": 1}
        assert needs["questions"][0]["question"] == question["question"]
        rows = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{item.project_id}/agent-rows/").json()
        [row] = rows["results"]
        assert row["question"]["id"] == question["id"] and row["claim"]["status"] == "working"

        answered = session_client.post(
            app_url(workspace, item, f"questions/{question['id']}/answer/"),
            {"option": 2, "text": "but log a warning when the old token is used"},
            format="json",
        )
        assert answered.status_code == status.HTTP_200_OK, answered.content
        result = answered.json()
        assert result["status"] == "answered" and result["answer_option"] == 2 and result["corrected"] is False
        assert result["answered_by"]["display_name"] and result["answer_source"] == "human"

        [message] = inbox(workspace, made, client)
        assert message["kind"] == "answer" and message["to"] == "session"
        assert message["work_item"]["identifier"] == f"STR-{item.sequence_id}"
        assert message["data"]["option"] == 2 and message["data"]["option_label"] == "24 hours"
        assert message["data"]["source"] == "human" and message["data"]["correction"] is False
        assert message["data"]["question_id"] == question["id"]
        assert "2. 24 hours (log a warning on use)" in message["body"] and "log a warning when" in message["body"]

        again = session_client.post(
            app_url(workspace, item, f"questions/{question['id']}/answer/"), {"option": 1}, format="json"
        )
        assert again.status_code == status.HTTP_409_CONFLICT
        assert session_client.get(f"/api/workspaces/{workspace.slug}/needs-you/").json()["counts"]["total"] == 0
        assert session_client.get(app_url(workspace, item, "agent-activity/")).json()["awaiting_input"] is False

    @pytest.mark.django_db
    def test_an_answer_is_checked(self, bot, workspace, item, holder, session_client):
        _, client = holder
        question = ask(workspace, item, client).json()
        path = app_url(workspace, item, f"questions/{question['id']}/answer/")
        assert session_client.post(path, {}, format="json").status_code == 400
        assert session_client.post(path, {"option": 4}, format="json").status_code == 400
        assert session_client.post(path, {"option": 0}, format="json").status_code == 400
        assert session_client.post(path, {"text": "x" * 2001}, format="json").status_code == 400
        assert AgentQuestion.objects.get(pk=question["id"]).status == "open"
        # a bot never answers its own questions
        with pytest.raises(SessionError):
            agent_steering.answer(AgentQuestion.objects.get(pk=question["id"]), bot.user, option=1)

    @pytest.mark.django_db
    def test_a_free_text_question_takes_words(self, workspace, item, holder, session_client):
        made, client = holder
        question = client.post(
            url(workspace, item, "questions/"), {"question": "Which name for the flag?"}, format="json"
        ).json()
        assert question["options"] == [] and question["default_option"] is None
        path = app_url(workspace, item, f"questions/{question['id']}/answer/")
        assert session_client.post(path, {"option": 1}, format="json").status_code == 400
        assert session_client.post(path, {"text": "use `--soft`"}, format="json").status_code == 200
        [message] = inbox(workspace, made, client)
        assert message["data"]["option"] is None and "use `--soft`" in message["body"]

    @pytest.mark.django_db
    def test_the_default_applies_when_the_deadline_passes(self, workspace, item, holder, session_client):
        made, client = holder
        question = ask(workspace, item, client, default=1, deadline_minutes=5).json()
        assert agent_steering.sweep_questions() == 0  # not yet
        AgentQuestion.objects.filter(pk=question["id"]).update(deadline=timezone.now() - timedelta(minutes=1))
        assert agent_steering.sweep_questions() == 1
        assert agent_steering.sweep_questions() == 0

        shown = client.get(url(workspace, item, f"questions/{question['id']}/")).json()
        assert shown["status"] == "defaulted" and shown["answer_option"] == 1 and shown["answer_source"] == "default"
        assert shown["lapsed_at"] and shown["answered_by"] is None and shown["corrected"] is False
        [message] = inbox(workspace, made, client)
        assert message["kind"] == "answer" and message["actor"] is None
        assert message["data"]["source"] == "default" and message["data"]["option"] == 1
        assert "The default applies: 1. No, revoke it at once" in message["body"]
        assert session_client.get(f"/api/workspaces/{workspace.slug}/needs-you/").json()["counts"]["total"] == 0

        # an answer that comes later still reaches the session, as a correction
        late = session_client.post(
            app_url(workspace, item, f"questions/{question['id']}/answer/"), {"option": 3}, format="json"
        )
        assert late.status_code == 200 and late.json()["corrected"] is True
        messages = inbox(workspace, made, client)
        assert [m["data"]["source"] for m in messages] == ["default", "human"]
        assert messages[1]["data"]["correction"] is True and "Treat this as a correction" in messages[1]["body"]

    @pytest.mark.django_db
    def test_a_deadline_with_no_default_lapses(self, workspace, item, holder):
        made, client = holder
        question = ask(workspace, item, client, deadline_minutes=5).json()
        AgentQuestion.objects.filter(pk=question["id"]).update(deadline=timezone.now() - timedelta(seconds=1))
        assert agent_steering.sweep_questions() == 1
        shown = client.get(url(workspace, item, f"questions/{question['id']}/")).json()
        assert shown["status"] == "expired" and shown["answer_option"] is None
        [message] = inbox(workspace, made, client)
        assert message["data"]["source"] == "expired" and "There is no default" in message["body"]

    @pytest.mark.django_db
    def test_a_question_without_a_deadline_waits(self, workspace, item, holder):
        _, client = holder
        question = ask(workspace, item, client, default=2).json()
        assert question["deadline"] is None
        assert agent_steering.sweep_questions() == 0
        assert AgentQuestion.objects.get(pk=question["id"]).status == "open"

    @pytest.mark.django_db
    def test_the_answer_goes_to_the_queue_once_the_session_has_ended(
        self, bot, workspace, item, holder, session_client
    ):
        made, client = holder
        question = ask(workspace, item, client).json()
        agent_sessions.end(made)
        assert (
            session_client.post(
                app_url(workspace, item, f"questions/{question['id']}/answer/"), {"option": 1}, format="json"
            ).status_code
            == 200
        )
        next_one, next_client = session(bot, workspace, "dddddddd-4444", "/Users/x/Git-Repos/ops")
        [message] = inbox(workspace, next_one, next_client)
        assert message["kind"] == "answer" and message["to"] == "queue"

    @pytest.mark.django_db
    def test_withdrawing_a_question(self, bot, workspace, item, holder, session_client):
        made, client = holder
        _, other_client = session(bot, workspace, "eeeeeeee-5555", "/Users/x/Git-Repos/ops")
        first, second = ask(workspace, item, client).json(), ask(workspace, item, client).json()
        path = url(workspace, item, f"questions/{first['id']}/")
        assert other_client.delete(path).status_code == status.HTTP_403_FORBIDDEN
        cancelled = client.delete(path)
        assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
        assert client.delete(path).status_code == status.HTTP_409_CONFLICT
        assert (
            session_client.post(
                app_url(workspace, item, f"questions/{first['id']}/answer/"), {"option": 1}, format="json"
            ).status_code
            == status.HTTP_409_CONFLICT
        )
        # a person can withdraw one too
        by_person = session_client.delete(app_url(workspace, item, f"questions/{second['id']}/"))
        assert by_person.status_code == 200 and by_person.json()["status"] == "cancelled"
        listed = client.get(url(workspace, item, "questions/?status=open")).json()["results"]
        assert listed == []
        assert len(client.get(url(workspace, item, "questions/")).json()["results"]) == 2

    @pytest.mark.django_db
    def test_a_question_is_checked(self, workspace, item, holder, api_key_client):
        _, client = holder
        path = url(workspace, item, "questions/")
        assert client.post(path, {"options": ["a"]}, format="json").status_code == 400
        assert client.post(path, {"question": "?", "default": 1}, format="json").status_code == 400
        assert ask(workspace, item, client, default=4).status_code == 400
        assert ask(workspace, item, client, options=["x"] * 9).status_code == 400
        assert ask(workspace, item, client, options=[{"detail": "no label"}]).status_code == 400
        assert ask(workspace, item, client, deadline="soon").status_code == 400
        past = (timezone.now() - timedelta(hours=1)).isoformat()
        assert ask(workspace, item, client, deadline=past).status_code == 400
        far = (timezone.now() + timedelta(days=60)).isoformat()
        assert ask(workspace, item, client, deadline=far).status_code == 400
        assert (
            ask(workspace, item, client, deadline=(timezone.now() + timedelta(hours=2)).isoformat()).status_code == 201
        )
        assert ask(workspace, item, api_key_client).status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_an_item_holds_a_limited_number_of_open_questions(self, workspace, item, holder):
        _, client = holder
        for number in range(agent_steering.OPEN_QUESTIONS_PER_ITEM):
            assert ask(workspace, item, client, question=f"Question {number}?").status_code == 201
        assert ask(workspace, item, client, question="One more?").status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestNeedsYou:
    @pytest.mark.django_db
    def test_it_lists_questions_and_items_in_review_for_those_in_the_project(
        self, bot, workspace, project, item, holder, session_client, create_user
    ):
        made, client = holder
        ask(workspace, item, client, deadline_minutes=60)
        other = Issue.objects.create(name="Backups", project=project, created_by=create_user)
        assert client.post(url(workspace, other, "claim/")).status_code == 201
        assert (
            client.post(url(workspace, other, "review/"), {"text": "Nightly dump works"}, format="json").status_code
            == 200
        )

        needs = session_client.get(f"/api/workspaces/{workspace.slug}/needs-you/")
        assert needs.status_code == status.HTTP_200_OK, needs.content
        data = needs.json()
        assert data["counts"] == {"questions": 1, "reviews": 1, "total": 2}
        assert data["questions"][0]["work_item"]["identifier"] == f"STR-{item.sequence_id}"
        [review] = data["reviews"]
        assert review["work_item"]["name"] == "Backups" and review["summary"] == "Nightly dump works"
        assert review["at"]

        stranger = User.objects.create(email="stranger@example.com", username="stranger")
        WorkspaceMember.objects.create(workspace=workspace, member=stranger, role=15)
        outsider = APIClient()
        outsider.force_authenticate(user=stranger)
        seen = outsider.get(f"/api/workspaces/{workspace.slug}/needs-you/").json()
        assert seen["counts"] == {"questions": 0, "reviews": 0, "total": 0}
        assert (
            outsider.post(
                app_url(workspace, item, f"questions/{data['questions'][0]['id']}/answer/"),
                {"option": 1},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

    @pytest.mark.django_db
    def test_the_agents_page_shows_each_session_s_state(self, bot, workspace, item, holder, session_client):
        made, client = holder
        client.patch(
            url(workspace, item, "claim/"),
            {"status_text": "Writing childOf()", "plan": ["Parse", "Compile", "Ship"], "plan_current": 2},
            format="json",
        )

        def board():
            sessions = session_client.get(f"/api/workspaces/{workspace.slug}/agent-sessions/?board=1").json()["results"]
            return next(entry for entry in sessions if entry["id"] == str(made.id))

        state = board()["agent_state"]
        assert state == {
            "state": "working",
            "status_text": "Writing childOf()",
            "plan": {"done": 1, "total": 3, "current": "Compile"},
        }
        assert board()["holds"][0]["status"] == "working"
        question = ask(workspace, item, client).json()
        assert board()["agent_state"]["state"] == "awaiting_input"
        client.delete(url(workspace, item, f"questions/{question['id']}/"))
        client.patch(url(workspace, item, "claim/"), {"status": "blocked"}, format="json")
        assert board()["agent_state"]["state"] == "blocked"


@pytest.mark.contract
class TestMcpTools:
    @pytest.mark.django_db
    def test_a_session_asks_and_reports_through_the_tools(self, workspace, item, holder, session_client):
        made, rest = holder
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + rest.token)

        def call(name, **arguments):
            response = client.post(
                "/mcp",
                {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}},
                format="json",
                HTTP_ACCEPT="application/json, text/event-stream",
            )
            assert response.status_code == status.HTTP_200_OK, response.content
            result = response.json()["result"]
            text = result["content"][0]["text"]
            return result["isError"], (text if result["isError"] else json.loads(text))

        where = {"project_id": str(item.project_id), "workitem_id": str(item.id)}
        error, status_line = call(
            "workitem_progress", action="status", status="working", text="Reading the code", **where
        )
        assert not error and status_line["claim"]["status_text"] == "Reading the code", status_line
        error, planned = call("workitem_progress", action="plan", steps=["Read", "Write", "Test"], current=2, **where)
        assert not error and planned["claim"]["plan_summary"]["current"] == "Write", planned
        error, logged = call(
            "workitem_progress", action="log", kind="commit", text="Add rotation", ref="abc1234", **where
        )
        assert not error and logged["data"] == {"ref": "abc1234"}
        error, listed = call("workitem_progress", action="list", kind="commit", **where)
        assert not error and [entry["text"] for entry in listed["results"]] == ["Add rotation"]
        error, message = call("workitem_progress", action="plan", **where)
        assert error and "needs: steps" in message

        error, asked = call(
            "workitem_question",
            action="ask",
            question="Keep the old token for a while?",
            options=["No", {"label": "24 hours", "detail": "log a warning"}],
            default=2,
            deadline_minutes=30,
            **where,
        )
        assert not error and asked["default_option"] == 2 and asked["status"] == "open", asked
        error, found = call("workitem_question", action="list", status="open", **where)
        assert not error and [q["id"] for q in found["results"]] == [asked["id"]]
        error, one = call("workitem_question", action="retrieve", question_id=asked["id"], **where)
        assert not error and one["question"] == "Keep the old token for a while?"

        assert (
            session_client.post(
                app_url(workspace, item, f"questions/{asked['id']}/answer/"), {"option": 1}, format="json"
            ).status_code
            == 200
        )
        error, answers = call("agent_inbox", action="list")
        assert not error and [m["kind"] for m in answers["results"]] == ["answer"]
        assert answers["results"][0]["data"]["option_label"] == "No"

        error, second = call("workitem_question", action="ask", question="And the new one?", **where)
        assert not error
        error, gone = call("workitem_question", action="cancel", question_id=second["id"], **where)
        assert not error and gone["status"] == "cancelled"

        error, reviewed = call("workitem_progress", action="review", text="Done, please look", **where)
        assert not error and reviewed["moved"] is True and reviewed["state"]["name"] == "Review", reviewed
        assert WorkItemClaim.objects.get(issue=item, ended_at__isnull=True).status == "waiting_for_review"
        assert AgentInboxMessage.objects.filter(kind="answer").count() == 1
