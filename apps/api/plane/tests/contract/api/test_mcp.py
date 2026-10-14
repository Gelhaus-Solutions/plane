# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The native /mcp endpoint: protocol, interface parity with the server agents used before, and tools."""

import json
import pathlib
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import FileAsset, Intake, Issue, IssueComment, Label, Project, ProjectMember, State
from plane.utils import agent_sessions, bots

INTERFACE = json.loads((pathlib.Path(__file__).parent / "fixtures" / "mcp_interface.json").read_text())


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
def bot_client(bot):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer " + bots.issue_token(bot, label="claude").token)
    return client


def rpc(client, method, params=None, message_id=1, path="/mcp"):
    message = {"jsonrpc": "2.0", "id": message_id, "method": method}
    if params is not None:
        message["params"] = params
    return client.post(path, message, format="json", HTTP_ACCEPT="application/json, text/event-stream")


def tool(client, tool_name, /, **arguments):
    response = rpc(client, "tools/call", {"name": tool_name, "arguments": arguments})
    assert response.status_code == status.HTTP_200_OK, response.content
    result = response.json()["result"]
    text = result["content"][0]["text"]
    return result["isError"], (text if result["isError"] else json.loads(text))


def signature(spec):
    if "anyOf" in spec:
        return "|".join(sorted(option["type"] for option in spec["anyOf"]))
    return spec["type"]


@pytest.mark.contract
class TestProtocol:
    @pytest.mark.django_db
    def test_initialize(self, bot_client):
        response = rpc(bot_client, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}})
        result = response.json()["result"]
        assert result["protocolVersion"] == "2025-06-18"
        assert result["serverInfo"]["name"] == "plane"
        assert result["capabilities"] == {"tools": {"listChanged": False}}
        assert "pql" in result["instructions"]

    @pytest.mark.django_db
    def test_an_unknown_version_gets_the_newest(self, bot_client):
        result = rpc(bot_client, "initialize", {"protocolVersion": "1999-01-01"}).json()["result"]
        assert result["protocolVersion"] == "2025-11-25"

    @pytest.mark.django_db
    def test_notifications_are_accepted_without_a_body(self, bot_client):
        response = bot_client.post("/mcp", {"jsonrpc": "2.0", "method": "notifications/initialized"}, format="json")
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert response.content == b""

    @pytest.mark.django_db
    def test_errors(self, bot_client):
        assert rpc(bot_client, "resources/list").json()["error"]["code"] == -32601
        bad = bot_client.post("/mcp", "{nope", content_type="application/json")
        assert (bad.status_code, bad.json()["error"]["code"]) == (400, -32700)
        assert rpc(bot_client, "tools/call", {"name": "teleport"}).json()["error"]["code"] == -32602
        assert bot_client.get("/mcp").status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    @pytest.mark.django_db
    def test_batch_and_trailing_slash(self, bot_client):
        batch = [
            {"jsonrpc": "2.0", "id": 1, "method": "ping"},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "ping"},
        ]
        replies = bot_client.post("/mcp/", batch, format="json").json()
        assert [reply["id"] for reply in replies] == [1, 2]

    @pytest.mark.django_db
    def test_no_token_is_a_401_that_says_how(self):
        response = rpc(APIClient(), "ping")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response["WWW-Authenticate"].startswith("Bearer")

    @pytest.mark.django_db
    def test_a_foreign_origin_is_refused(self, bot_client):
        response = bot_client.post(
            "/mcp", {"jsonrpc": "2.0", "id": 1, "method": "ping"}, format="json", HTTP_ORIGIN="https://evil.example"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestInterface:
    @pytest.mark.django_db
    def test_tools_keep_the_names_actions_and_argument_shapes_agents_use(self, bot_client):
        listed = {t["name"]: t for t in rpc(bot_client, "tools/list").json()["result"]["tools"]}
        for name, expected in INTERFACE.items():
            if name.startswith("_"):
                continue
            assert name in listed, name
            properties = dict(listed[name]["inputSchema"]["properties"])
            action = properties.pop("action", None)
            assert (action["enum"] if action else None) == expected["actions"], name
            assert {key: signature(spec) for key, spec in properties.items()} == expected["properties"], name
            assert listed[name]["inputSchema"]["additionalProperties"] is False


@pytest.mark.contract
class TestTools:
    @pytest.mark.django_db
    def test_work_items_end_to_end(self, bot_client, project, bot):
        todo = State.objects.filter(project=project, group="unstarted").first() or State.objects.create(
            project=project, name="Todo", group="unstarted", color="#ccc"
        )
        label = Label.objects.create(project=project, name="api", color="#00f")

        error, item = tool(
            bot_client,
            "workitem",
            action="create",
            project_id=str(project.id),
            name="Wire /mcp",
            description_stripped="First line\n\nSecond <b>line</b>",
            priority="high",
        )
        assert not error, item
        stored = Issue.objects.get(pk=item["id"])
        # Plane keeps descriptions inside a <div>; the text is escaped once, the paragraphs are real HTML
        assert "<p>First line</p><p>Second &lt;b&gt;line&lt;/b&gt;</p>" in stored.description_html
        assert stored.created_by_id == bot.user_id

        error, found = tool(bot_client, "workitem", action="list", project_id=str(project.id), pql='priority = "high"')
        assert not error and [r["id"] for r in found["results"]] == [item["id"]]

        error, by_key = tool(bot_client, "workitem", action="retrieve_by_identifier", workitem_identifier="agt-1")
        assert not error and by_key["id"] == item["id"]

        error, updated = tool(
            bot_client,
            "workitem",
            action="update",
            project_id=str(project.id),
            workitem_id=item["id"],
            state=str(todo.id),
            name="",
        )
        assert not error and str(updated["state"]) == str(todo.id) and updated["name"] == "Wire /mcp"

        error, labelled = tool(
            bot_client,
            "workitem",
            action="manage_label",
            project_id=str(project.id),
            workitem_id=item["id"],
            add_label_id=str(label.id),
        )
        assert not error and [str(x) for x in labelled["labels"]] == [str(label.id)]

        error, counted = tool(bot_client, "workitem", action="count", project_id=str(project.id), group_by="priority")
        assert not error, counted

        error, gone = tool(bot_client, "workitem", action="delete", project_id=str(project.id), workitem_id=item["id"])
        assert not error and gone == {"deleted": item["id"]}

    @pytest.mark.django_db
    def test_tool_errors_come_back_as_results(self, bot_client, project):
        error, message = tool(bot_client, "workitem", action="create", project_id=str(project.id))
        assert error and "needs: name" in message
        error, message = tool(bot_client, "workitem", action="list", colour="red")
        assert error and "Unknown argument" in message
        error, message = tool(bot_client, "workitem", action="archive", project_id=str(project.id), workitem_id="x")
        assert error and "not available on this Plane yet" in message
        error, message = tool(bot_client, "state", action="list")
        assert error and "pass project_id" in message
        error, message = tool(
            bot_client,
            "workitem",
            action="retrieve",
            project_id=str(project.id),
            workitem_id="00000000-0000-0000-0000-000000000000",
        )
        assert error and message.startswith("Plane answered 404")

    @pytest.mark.django_db
    def test_catalog_tools(self, bot_client, api_key_client, project, workspace, create_user):
        error, states = tool(bot_client, "state", action="list", project_id=str(project.id))
        assert not error, states
        # A project member cannot change features; the inner API call refuses, as REST would
        error, message = tool(bot_client, "project", action="update_features", project_id=str(project.id), modules=True)
        assert error and message.startswith("Plane answered 403")
        error, features = tool(
            api_key_client, "project", action="update_features", project_id=str(project.id), modules=True
        )
        assert not error and features["modules"] is True and features["epics"] is False, features
        error, message = tool(bot_client, "project", action="update_features", project_id=str(project.id), epics=True)
        assert error and "epics is not available" in message
        error, me = tool(bot_client, "member", action="me")
        assert not error and me["display_name"] == "Claude"
        error, bots_only = tool(api_key_client, "member", action="list_workspace", is_bot=True)
        assert not error, bots_only
        error, roles = tool(bot_client, "member", action="list_roles", namespace="project")
        assert not error and [r["id"] for r in roles] == ["project:admin", "project:member", "project:guest"]
        error, reference = tool(bot_client, "get_pql_reference", detail="brief")
        assert not error and "stateGroup" in reference["reference"]
        error, here = tool(bot_client, "workspace", action="retrieve")
        assert not error and (here["slug"], here["connection"]) == (workspace.slug, "api_token")

    @pytest.mark.django_db
    def test_a_session_token_works_and_is_recognised(self, bot, workspace, project):
        key = bots.issue_token(bot, label="claude")
        session, token, _ = agent_sessions.register(key, workspace, {"harness": "claude-code", "external_id": "s-1"})
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + token.token)
        error, here = tool(client, "workspace", action="retrieve")
        assert not error and here["connection"] == "agent_session"

    @pytest.mark.django_db
    def test_the_workspace_must_be_one_of_yours(self, api_key_client, workspace):
        response = rpc(
            api_key_client,
            "tools/call",
            {"name": "workspace", "arguments": {"action": "retrieve"}},
            path="/mcp?workspace=elsewhere",
        )
        result = response.json()["result"]
        assert result["isError"] and "not a member of workspace elsewhere" in result["content"][0]["text"]
        error, here = tool(api_key_client, "workspace", action="retrieve")
        assert not error and here["slug"] == workspace.slug


def new_item(client, project, name):
    error, item = tool(client, "workitem", action="create", project_id=str(project.id), name=name)
    assert not error, item
    return item


@pytest.mark.contract
class TestWorkItemParts:
    @pytest.mark.django_db
    def test_comments_carry_mentions_both_ways(self, bot_client, project, create_user):
        item = new_item(bot_client, project, "Discuss")
        where = {"project_id": str(project.id), "workitem_id": item["id"]}
        error, comment = tool(
            bot_client, "workitem_comment", action="create", comment_html=f"<p>@[{create_user.id}] look</p>", **where
        )
        assert not error, comment
        stored = IssueComment.objects.get(pk=comment["id"]).comment_html
        assert f'entity_identifier="{create_user.id}"' in stored and 'entity_name="user_mention"' in stored
        assert comment["comment_html"] == f"<p>@[{create_user.id}] look</p>"

        error, listed = tool(bot_client, "workitem_comment", action="list", **where)
        assert not error and [c["comment_html"] for c in listed["results"]] == [comment["comment_html"]]

        stranger = "11111111-2222-3333-4444-555555555555"
        error, message = tool(
            bot_client,
            "workitem_comment",
            action="update",
            comment_id=comment["id"],
            comment_html=f"@[{stranger}]",
            **where,
        )
        assert error and "Not a member of this project" in message

        error, edited = tool(
            bot_client,
            "workitem_comment",
            action="update",
            comment_id=comment["id"],
            comment_html="<p>done</p>",
            **where,
        )
        assert not error and edited["comment_html"] == "<p>done</p>"
        error, gone = tool(bot_client, "workitem_comment", action="delete", comment_id=comment["id"], **where)
        assert not error and gone == {"deleted": comment["id"]}

    @pytest.mark.django_db
    def test_relations_links_and_activity(self, bot_client, project):
        item, blocker = new_item(bot_client, project, "Ship"), new_item(bot_client, project, "Build")
        where = {"project_id": str(project.id), "workitem_id": item["id"]}

        error, _ = tool(
            bot_client,
            "workitem_relation",
            action="create",
            relation_type="blocked_by",
            workitem_ids=[blocker["id"]],
            **where,
        )
        assert not error, _
        error, relations = tool(bot_client, "workitem_relation", action="list", **where)
        assert not error and [r["issue_id"] for r in relations["blocked_by"]] == [blocker["id"]]
        error, message = tool(bot_client, "workitem_relation", action="create", workitem_ids=[blocker["id"]], **where)
        assert error and "relation_type must be one of" in message
        error, message = tool(bot_client, "workitem_relation", action="list_definitions")
        assert error and "not available on this Plane yet" in message

        error, link = tool(bot_client, "workitem_link", action="create", url="https://example.com/spec", **where)
        assert not error, link
        error, link = tool(bot_client, "workitem_link", action="update", link_id=link["id"], title="Spec", **where)
        assert not error and (link["title"], link["url"]) == ("Spec", "https://example.com/spec")
        error, message = tool(bot_client, "workitem_link", action="update", link_id=link["id"], **where)
        assert error and "Nothing to change" in message
        error, gone = tool(bot_client, "workitem_link", action="delete", link_id=link["id"], **where)
        assert not error and gone == {"deleted": link["id"]}

        error, history = tool(bot_client, "workitem_activity", action="list", **where)
        assert not error and "results" in history, history

    @pytest.mark.django_db
    def test_attachments(self, bot_client, project, workspace, monkeypatch):
        item = new_item(bot_client, project, "Files")
        where = {"project_id": str(project.id), "workitem_id": item["id"]}
        asset = FileAsset.objects.create(
            attributes={"name": "spec.pdf", "type": "application/pdf", "size": 10},
            asset=f"{workspace.id}/spec.pdf",
            size=10,
            workspace=workspace,
            project=project,
            issue_id=item["id"],
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            is_uploaded=True,
        )

        class Storage:
            def __init__(self, request=None):
                pass

            def generate_presigned_url(self, object_name, **kwargs):
                return f"https://files.example/{object_name}?signed"

        monkeypatch.setattr("plane.api.views.issue.S3Storage", Storage)

        error, files = tool(bot_client, "workitem_attachment", action="list", **where)
        assert not error and [f["id"] for f in files] == [str(asset.id)]
        error, link = tool(
            bot_client, "workitem_attachment", action="download_url", attachment_id=str(asset.id), **where
        )
        assert not error and link["url"] == f"https://files.example/{workspace.id}/spec.pdf?signed"
        error, message = tool(bot_client, "workitem_attachment", action="read", attachment_id=str(asset.id), **where)
        assert error and "not available on this Plane yet" in message
        error, gone = tool(bot_client, "workitem_attachment", action="delete", attachment_id=str(asset.id), **where)
        assert not error and gone == {"deleted": str(asset.id)}


@pytest.mark.contract
class TestPlanning:
    @pytest.mark.django_db
    def test_cycles(self, bot_client, project):
        Project.objects.filter(pk=project.pk).update(cycle_view=True)
        item = new_item(bot_client, project, "Sprint work")
        # transfer moves only unfinished work, which means a state in an open group
        todo = State.objects.create(project=project, name="Todo", group="unstarted", color="#ccc")
        Issue.objects.filter(pk=item["id"]).update(state=todo)
        today = timezone.now().date()
        here = {"project_id": str(project.id)}

        error, first = tool(
            bot_client,
            "cycle",
            action="create",
            name="Sprint 1",
            start_date=str(today - timedelta(days=7)),
            end_date=str(today + timedelta(days=7)),
            **here,
        )
        assert not error, first
        error, second = tool(
            bot_client,
            "cycle",
            action="create",
            name="Sprint 2",
            start_date=str(today + timedelta(days=8)),
            end_date=str(today + timedelta(days=21)),
            **here,
        )
        assert not error, second
        error, current = tool(bot_client, "cycle", action="list", status="current", **here)
        assert not error and [c["id"] for c in current] == [first["id"]]

        error, managed = tool(
            bot_client, "cycle", action="manage_workitems", cycle_id=first["id"], add_ids=item["id"], **here
        )
        assert not error and managed == {"added": [item["id"]], "removed": []}
        error, inside = tool(bot_client, "cycle", action="list_workitems", cycle_id=first["id"], **here)
        assert not error and [r["id"] for r in inside["results"]] == [item["id"]]
        error, filtered = tool(
            bot_client, "cycle", action="list_workitems", cycle_id=first["id"], pql='priority = "urgent"', **here
        )
        assert not error and filtered["results"] == []

        error, message = tool(
            bot_client, "cycle", action="transfer_workitems", cycle_id=first["id"], new_cycle_id=second["id"], **here
        )
        assert error and "not completed yet" in message
        error, completed = tool(bot_client, "cycle", action="complete", cycle_id=first["id"], **here)
        assert not error, completed
        error, moved = tool(
            bot_client, "cycle", action="transfer_workitems", cycle_id=first["id"], new_cycle_id=second["id"], **here
        )
        assert not error, moved
        error, inside = tool(bot_client, "cycle", action="list_workitems", cycle_id=second["id"], **here)
        assert not error and [r["id"] for r in inside["results"]] == [item["id"]]
        error, managed = tool(
            bot_client, "cycle", action="manage_workitems", cycle_id=second["id"], remove_ids=item["id"], **here
        )
        assert not error
        error, inside = tool(bot_client, "cycle", action="list_workitems", cycle_id=second["id"], **here)
        assert not error and inside["results"] == []

        error, archived = tool(bot_client, "cycle", action="archive", cycle_id=first["id"], **here)
        assert not error and archived == {"archived": first["id"]}
        error, listed = tool(bot_client, "cycle", action="list", archived=True, **here)
        assert not error and [c["id"] for c in listed["results"]] == [first["id"]]
        error, back = tool(bot_client, "cycle", action="unarchive", cycle_id=first["id"], **here)
        assert not error and back == {"unarchived": first["id"]}
        error, message = tool(bot_client, "cycle", action="list", status="someday", **here)
        assert error and "status must be one of" in message
        error, gone = tool(bot_client, "cycle", action="delete", cycle_id=second["id"], **here)
        assert not error and gone == {"deleted": second["id"]}

    @pytest.mark.django_db
    def test_modules(self, bot_client, project, create_user):
        Project.objects.filter(pk=project.pk).update(module_view=True)
        item = new_item(bot_client, project, "Feature work")
        here = {"project_id": str(project.id)}

        error, module = tool(
            bot_client,
            "module",
            action="create",
            name="Search",
            status="in-progress",
            members=str(create_user.id),
            **here,
        )
        assert not error, module
        error, managed = tool(
            bot_client, "module", action="manage_workitems", module_id=module["id"], add_ids=item["id"], **here
        )
        assert not error
        error, inside = tool(bot_client, "module", action="list_workitems", module_id=module["id"], **here)
        assert not error and [r["id"] for r in inside["results"]] == [item["id"]]

        error, message = tool(bot_client, "module", action="archive", module_id=module["id"], **here)
        assert error and "Only completed or cancelled modules" in message
        error, updated = tool(bot_client, "module", action="update", module_id=module["id"], status="completed", **here)
        assert not error and updated["status"] == "completed"
        error, archived = tool(bot_client, "module", action="archive", module_id=module["id"], **here)
        assert not error and archived == {"archived": module["id"]}
        error, listed = tool(bot_client, "module", action="list", archived=True, **here)
        assert not error and [m["id"] for m in listed["results"]] == [module["id"]]
        error, back = tool(bot_client, "module", action="unarchive", module_id=module["id"], **here)
        assert not error
        error, managed = tool(
            bot_client, "module", action="manage_workitems", module_id=module["id"], remove_ids=item["id"], **here
        )
        assert not error
        error, inside = tool(bot_client, "module", action="list_workitems", module_id=module["id"], **here)
        assert not error and inside["results"] == []

    @pytest.mark.django_db
    def test_intake(self, bot_client, api_key_client, project, workspace):
        Project.objects.filter(pk=project.pk).update(intake_view=True)
        Intake.objects.create(name="Intake", project=project, workspace=workspace)
        State.objects.create(project=project, name="Todo", group="unstarted", color="#ccc", default=True)
        here = {"project_id": str(project.id)}

        error, record = tool(bot_client, "intake", action="create", name="Customer asks", priority="high", **here)
        assert not error, record
        issue_id = str(record["issue"])
        error, found = tool(bot_client, "intake", action="retrieve", workitem_id=issue_id, **here)
        assert not error and found["status"] == -2
        error, message = tool(bot_client, "intake", action="update", workitem_id=issue_id, status=1, **here)
        assert error and "only a project admin" in message
        error, accepted = tool(api_key_client, "intake", action="update", workitem_id=issue_id, status=1, **here)
        assert not error and accepted["status"] == 1
        error, listed = tool(bot_client, "intake", action="list", **here)
        assert not error and [str(r["issue"]) for r in listed["results"]] == [issue_id]

    @pytest.mark.django_db
    def test_state_groups(self, bot_client, api_key_client, project):
        error, groups = tool(bot_client, "state_group", action="list")
        assert not error and "review" in [g["key"] for g in groups]
        error, message = tool(bot_client, "state_group", action="create", name="Waiting", category="started")
        assert error and message.startswith("Plane answered 403")  # groups are a workspace admin's to change
        error, waiting = tool(api_key_client, "state_group", action="create", name="Waiting", category="started")
        assert not error, waiting

        where = {"project_id": str(project.id), "color": "#ccc"}
        error, parked = tool(api_key_client, "state", action="create", name="Parked", group="waiting", **where)
        assert not error and (parked["group"], parked["state_group"]) == ("started", waiting["id"]), parked
        error, message = tool(api_key_client, "state", action="create", name="Lost", group="Nowhere", **where)
        assert error and "No state group named Nowhere" in message

    @pytest.mark.django_db
    def test_priorities(self, bot_client, api_key_client, project):
        error, message = tool(bot_client, "priority", action="create", name="Blocker", level="urgent")
        assert error and message.startswith("Plane answered 403")
        error, blocker = tool(api_key_client, "priority", action="create", name="Blocker", level="urgent")
        assert not error, blocker
        error, item = tool(
            bot_client, "workitem", action="create", project_id=str(project.id), name="Fix", priority="Blocker"
        )
        assert not error and (item["priority"], item["priority_option"]) == ("urgent", blocker["id"]), item
        error, found = tool(
            bot_client, "workitem", action="list", project_id=str(project.id), pql='priority = "Blocker"'
        )
        assert not error and [r["id"] for r in found["results"]] == [item["id"]]

    @pytest.mark.django_db
    def test_a_bot_cannot_close_work(self, bot_client, api_key_client, project):
        done = State.objects.create(project=project, name="Done", group="completed", color="#0f0")
        here = {"project_id": str(project.id)}
        error, item = tool(bot_client, "workitem", action="create", name="Ship it", **here)
        assert not error, item

        error, closed = tool(
            bot_client, "workitem", action="update", workitem_id=item["id"], state=str(done.id), **here
        )
        review = State.objects.get(project=project, state_group__key="review")  # made on demand here
        assert not error and str(closed["state"]) == str(review.id) and "Review" in closed["note"], closed
        assert Issue.objects.get(pk=item["id"]).completed_at is None

        error, closed = tool(
            api_key_client, "workitem", action="update", workitem_id=item["id"], state=str(done.id), **here
        )
        assert not error and str(closed["state"]) == str(done.id) and "note" not in closed
        assert Issue.objects.get(pk=item["id"]).completed_at is not None
