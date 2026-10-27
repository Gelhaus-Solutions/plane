# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The MCP `dashboard` tool (E23): charts over PQL and dashboards, for agents."""

import json
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Project, ProjectMember, State
from plane.utils import bots


@pytest.fixture
def project(db, workspace, create_user):
    """Three items: one done before the last two weeks, one open, one done two days ago."""
    project = Project.objects.create(name="Dash", identifier="DSH", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    states = {
        group: State.objects.create(name=group.title(), group=group, project=project, workspace=workspace)
        for group in ("backlog", "completed")
    }
    now = timezone.now()
    for name, group, created, done in (
        ("old", "completed", 30, 20),
        ("open", "backlog", 5, None),
        ("done", "completed", 10, 2),
    ):
        issue = Issue.objects.create(
            name=name, state=states[group], project=project, workspace=workspace, created_by=create_user
        )
        Issue.objects.filter(pk=issue.pk).update(
            created_at=now - timedelta(days=created), completed_at=now - timedelta(days=done) if done else None
        )
    return project


@pytest.fixture
def bot_client(db, workspace, create_user, project):
    bot = bots.create_bot(workspace, "Claude", created_by=create_user)
    bots.add_to_project(bot, project, 15)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer " + bots.issue_token(bot, label="claude").token)
    return client


def tool(client, **arguments):
    message = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "dashboard", "arguments": arguments},
    }
    response = client.post("/mcp", message, format="json", HTTP_ACCEPT="application/json, text/event-stream")
    assert response.status_code == status.HTTP_200_OK, response.content
    result = response.json()["result"]
    text = result["content"][0]["text"]
    return result["isError"], (text if result["isError"] else json.loads(text))


@pytest.mark.contract
class TestDashboardTool:
    @pytest.mark.django_db
    def test_total_and_resolved_over_time(self, bot_client):
        error, data = tool(
            bot_client, action="chart", chart="line", measure="running", x_axis="created_resolved", period="2w"
        )
        assert not error, data
        series = {s["key"]: s["values"][-1] for s in data["series"]}
        assert series == {"total": 3, "resolved": 2}

    @pytest.mark.django_db
    def test_a_dashboard_from_the_tool(self, bot_client):
        _, dashboard = tool(bot_client, action="create", name="Bot board", access="workspace")
        _, widget = tool(
            bot_client,
            action="add_widget",
            dashboard_id=dashboard["id"],
            title="Open",
            chart="number",
            pql="stateGroup IN openStates()",
        )
        assert (widget["width"], widget["config"]["measure"]) == (6, "count")
        _, data = tool(bot_client, action="data", dashboard_id=dashboard["id"])
        assert data["widgets"][widget["id"]]["value"] == 1
        _, listed = tool(bot_client, action="list")
        assert [d["name"] for d in listed] == ["Bot board"]
        error, message = tool(bot_client, action="update", dashboard_id=dashboard["id"])
        assert error and "Nothing to change" in message

    @pytest.mark.django_db
    def test_a_project_lens(self, bot_client, project, workspace, create_user):
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)
        _, dashboard = tool(bot_client, action="create", name="Dash board", project_ids=str(project.id))
        _, widget = tool(bot_client, action="add_widget", dashboard_id=dashboard["id"], title="All", chart="number")
        _, listed = tool(bot_client, action="list", project_id=str(project.id))
        assert [d["name"] for d in listed] == ["Dash board"]
        _, listed = tool(bot_client, action="list", project_id=str(other.id))
        assert listed == []
        _, data = tool(bot_client, action="data", dashboard_id=dashboard["id"], project_id=str(project.id))
        assert data["widgets"][widget["id"]]["value"] == 3
        error, message = tool(bot_client, action="data", dashboard_id=dashboard["id"], project_id=str(other.id))
        assert error and "does not count" in message

    @pytest.mark.django_db
    def test_a_bad_query_comes_back_as_the_widget_error(self, bot_client):
        error, data = tool(bot_client, action="chart", chart="number", pql="priority = ")
        assert not error
        assert "message" in data["error"]
