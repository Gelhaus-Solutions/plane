# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dashboards (E23): private and workspace dashboards of PQL widgets, who edits them (D47), and the numbers each
widget draws, resolved meaning done or cancelled."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.utils.state_groups import builtin_state_groups
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)

THROUGHPUT = [
    {"title": "Created", "chart": "number", "config": {"measure": "created"}, "width": 3, "height": 3},
    {"title": "Resolved", "chart": "number", "config": {"measure": "resolved"}, "width": 3, "height": 3},
    {
        "title": "Total and resolved",
        "chart": "line",
        "config": {"measure": "running", "x_axis": "created_resolved"},
        "width": 8,
    },
    {"title": "Done, people and bots", "chart": "bars", "config": {"x_axis": "done", "split_by": "assignee_type"}},
    {"title": "By state group", "chart": "rows", "config": {"x_axis": "state_group", "split_by": "status"}},
    {"title": "Oldest open", "chart": "list", "pql": "stateGroup IN openStates()", "config": {"sort": "oldest"}},
]


def ago(days):
    return timezone.now() - timedelta(days=days)


@pytest.fixture
def member(db, workspace):
    user = User.objects.create(email="member@plane.so", username="mia", first_name="Mia", last_name="Member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


@pytest.fixture
def member_client(member):
    client = APIClient()
    client.force_authenticate(user=member)
    return client


@pytest.fixture
def items(db, workspace, create_user, create_bot_user):
    project = Project.objects.create(name="Dash", identifier="DSH", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    states = {
        group: State.objects.create(name=group.title(), group=group, project=project, workspace=workspace)
        for group in ("backlog", "completed", "cancelled")
    }
    elsewhere = Project.objects.create(name="Elsewhere", identifier="ELS", workspace=workspace, created_by=create_user)

    def item(name, group, created, completed=None, assignee=None, in_project=project):
        issue = Issue.objects.create(
            name=name,
            state=states[group] if in_project == project else None,
            project=in_project,
            workspace=workspace,
            created_by=create_user,
        )
        Issue.objects.filter(pk=issue.pk).update(created_at=created, completed_at=completed)
        if assignee:
            IssueAssignee.objects.create(issue=issue, assignee=assignee, project=in_project, workspace=workspace)
        return issue

    item("old", "completed", ago(30), ago(20))
    item("open", "backlog", ago(5))
    item("done by a bot", "completed", ago(10), ago(2), assignee=create_bot_user)
    dropped = item("dropped", "cancelled", ago(3))
    change = IssueActivity.objects.create(
        issue=dropped, field="state", verb="updated", project=project, workspace=workspace
    )
    IssueActivity.objects.filter(pk=change.pk).update(created_at=ago(1))
    item("not mine", "backlog", ago(4), in_project=elsewhere)
    return project


def url(workspace, *parts):
    return "/".join([f"/api/workspaces/{workspace.slug}/dashboards", *parts, ""])


def create(client, workspace, **body):
    response = client.post(url(workspace), {"name": "Throughput", **body}, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return response.data


@pytest.mark.contract
class TestDashboards:
    @pytest.mark.django_db
    def test_a_template_lands_with_its_widgets_in_order(self, session_client, workspace):
        dashboard = create(session_client, workspace, widgets=THROUGHPUT, period="2w")
        assert [w["title"] for w in dashboard["widgets"]] == [w["title"] for w in THROUGHPUT]
        assert dashboard["access"] == "private" and dashboard["can_edit"]
        line = dashboard["widgets"][2]
        assert line["config"]["measure"] == "running" and line["config"]["split_by"] == ""
        listed = session_client.get(url(workspace)).data
        assert [(d["name"], d["widget_count"]) for d in listed] == [("Throughput", len(THROUGHPUT))]

    @pytest.mark.django_db
    def test_a_bad_query_is_refused_with_its_position(self, session_client, workspace):
        response = session_client.post(
            url(workspace),
            {"name": "Broken", "widgets": [{"title": "x", "chart": "number", "pql": "priority = "}]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "pql" in response.data

    @pytest.mark.django_db
    def test_private_is_the_owners_and_workspace_dashboards_are_edited_by_owner_and_admins(
        self, session_client, member_client, workspace
    ):
        private = create(member_client, workspace, name="Mine")
        shared = create(member_client, workspace, name="Shared", access="workspace")
        # the admin sees the shared one only, and may edit it but not take it private
        assert [d["name"] for d in session_client.get(url(workspace)).data] == ["Shared"]
        assert session_client.get(url(workspace, private["id"])).status_code == status.HTTP_404_NOT_FOUND
        assert session_client.patch(url(workspace, shared["id"]), {"name": "Ours"}, format="json").status_code == 200
        refused = session_client.patch(url(workspace, shared["id"]), {"access": "private"}, format="json")
        assert refused.status_code == status.HTTP_403_FORBIDDEN

        # a member sees an admin's workspace dashboard but does not edit it; a duplicate is theirs
        theirs = create(session_client, workspace, name="Admin's", access="workspace")
        assert member_client.patch(url(workspace, theirs["id"]), {"name": "x"}, format="json").status_code == 403
        add = member_client.post(url(workspace, theirs["id"], "widgets"), {"title": "n", "chart": "number"})
        assert add.status_code == status.HTTP_403_FORBIDDEN
        copy = member_client.post(url(workspace, theirs["id"], "duplicate"), {}, format="json").data
        assert (copy["access"], copy["can_edit"], copy["name"]) == ("private", True, "Admin's copy")

    @pytest.mark.django_db
    def test_widgets_are_added_moved_resized_and_removed(self, session_client, workspace):
        dashboard = create(session_client, workspace, widgets=THROUGHPUT[:2])
        first, second = dashboard["widgets"]
        added = session_client.post(
            url(workspace, dashboard["id"], "widgets"),
            {"title": "Open", "chart": "number", "pql": "stateGroup IN openStates()", "config": {"measure": "x"}},
            format="json",
        ).data
        assert added["config"]["measure"] == "count"
        layout = session_client.post(
            url(workspace, dashboard["id"], "layout"),
            {
                "widgets": [
                    {"id": added["id"], "sort_order": 1, "width": 12, "height": 4},
                    {"id": first["id"], "sort_order": 2, "width": 3, "height": 3},
                    {"id": second["id"], "sort_order": 3, "width": 3, "height": 3},
                ]
            },
            format="json",
        ).data
        assert [(w["title"], w["width"]) for w in layout] == [("Open", 12), ("Created", 3), ("Resolved", 3)]
        session_client.patch(url(workspace, dashboard["id"], "widgets", first["id"]), {"title": "New"}, format="json")
        session_client.delete(url(workspace, dashboard["id"], "widgets", second["id"]))
        widgets = session_client.get(url(workspace, dashboard["id"])).data["widgets"]
        assert [w["title"] for w in widgets] == ["Open", "New"]

    @pytest.mark.django_db
    def test_favourites(self, session_client, workspace):
        dashboard = create(session_client, workspace)
        session_client.post(url(workspace, dashboard["id"], "favorite"))
        assert session_client.get(url(workspace)).data[0]["is_favorite"] is True
        session_client.delete(url(workspace, dashboard["id"], "favorite"))
        assert session_client.get(url(workspace)).data[0]["is_favorite"] is False

    @pytest.mark.django_db
    def test_the_numbers_each_widget_draws(self, session_client, workspace, items, create_bot_user):
        dashboard = create(session_client, workspace, widgets=THROUGHPUT, period="2w")
        ids = [w["id"] for w in dashboard["widgets"]]
        data = session_client.get(url(workspace, dashboard["id"], "data")).data
        assert data["period"]["bucket"] == "day" and data["period"]["days"] == 14
        created, resolved, line, done, rows, oldest = (data["widgets"][i] for i in ids)

        # created in the last two weeks, against the two before; resolved is done or cancelled
        assert (created["value"], created["previous"]) == (3, 0)
        assert (resolved["value"], resolved["previous"]) == (2, 1)
        assert sum(resolved["trend"]) == 2

        # total and resolved over time: what existed and what was resolved by each day's end
        series = {s["key"]: s["values"] for s in line["series"]}
        assert (series["total"][0], series["total"][-1]) == (1, 4)
        assert (series["resolved"][0], series["resolved"][-2], series["resolved"][-1]) == (1, 3, 3)
        assert series["resolved"][-3] == 2

        done_by = {s["key"]: sum(s["values"]) for s in done["series"]}
        assert done_by == {"bots": 1}

        assert [s["key"] for s in rows["series"]] == ["done", "open", "cancelled"]
        by_group = {r["key"]: r["values"] for r in rows["rows"]}
        assert by_group == {"completed": [2, 0, 0], "backlog": [0, 1, 0], "cancelled": [0, 0, 1]}

        assert [i["name"] for i in oldest["items"]] == ["open"]
        assert oldest["items"][0]["key"].startswith("DSH-")
        assert oldest["matched"] == 1

    @pytest.mark.django_db
    def test_a_widget_with_a_broken_query_fails_alone(self, session_client, workspace, items):
        dashboard = create(session_client, workspace, widgets=THROUGHPUT[:1])
        preview = session_client.post(
            url(workspace, dashboard["id"], "preview"), {"chart": "number", "pql": "priority = "}, format="json"
        ).data
        assert "error" in preview
        ok = session_client.post(
            url(workspace, dashboard["id"], "preview"),
            {"chart": "number", "pql": "stateGroup IN openStates()", "scope": {"period": "quarter"}},
            format="json",
        ).data
        assert (ok["value"], ok["period"]["bucket"]) == (1, "week")

    @pytest.mark.django_db
    def test_rows_and_series_split_through_assignees_and_labels(
        self, session_client, workspace, items, create_bot_user
    ):
        dashboard = create(session_client, workspace, period="2w")

        def preview(chart, **config):
            response = session_client.post(
                url(workspace, dashboard["id"], "preview"), {"chart": chart, "config": config}, format="json"
            )
            assert response.status_code == status.HTTP_200_OK, response.data
            return response.data

        rows = preview("table", x_axis="assignee", split_by="label")
        by_assignee = {r["key"]: r["total"] for r in rows["rows"]}
        # an item without an assignee still counts, in its own row
        assert by_assignee == {str(create_bot_user.id): 1, "none": 3}
        assert [s["key"] for s in rows["series"]] == ["none"]

        running = preview("line", measure="running", x_axis="created", split_by="assignee")
        totals = {s["key"]: s["values"][-1] for s in running["series"]}
        assert totals == {str(create_bot_user.id): 1, "none": 3}

        # people before bots, whichever did more
        response = session_client.post(
            url(workspace, dashboard["id"], "preview"),
            {
                "chart": "bars",
                "config": {"x_axis": "done", "split_by": "assignee_type"},
                "scope": {"period": "quarter"},
            },
            format="json",
        )
        assert [s["key"] for s in response.data["series"]] == ["people", "bots"]

    @pytest.mark.django_db
    def test_the_web_templates_queries_compile(self, session_client, workspace):
        builtin_state_groups(workspace.id)  # every workspace has them; Review is one
        # the queries the web's templates (Throughput, Cycle health, Bot activity) put on their widgets
        queries = [
            "stateGroup IN openStates()",
            'stateGroup = "Review"',
            "isOverdue()",
            "claimedBy IS NOT NULL",
        ]
        create(
            session_client,
            workspace,
            pql="cycle IN activeCycle()",
            widgets=[{"title": q, "chart": "number", "pql": q} for q in queries],
        )

    @pytest.mark.django_db
    def test_a_project_shows_the_dashboards_that_count_it(self, session_client, workspace, items):
        elsewhere = Project.objects.get(identifier="ELS")
        create(session_client, workspace, name="Dash only", project_ids=[str(items.id)])
        create(session_client, workspace, name="Elsewhere only", project_ids=[str(elsewhere.id)])
        create(session_client, workspace, name="Every project")

        listed = session_client.get(url(workspace), {"project": str(items.id)}).data
        assert sorted(d["name"] for d in listed) == ["Dash only", "Every project"]
        assert {d["name"]: d["project_ids"] for d in listed}["Dash only"] == [str(items.id)]
        assert len(session_client.get(url(workspace)).data) == 3
        assert session_client.get(url(workspace), {"project": "nope"}).status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_opened_from_a_project_it_counts_that_project_alone(self, session_client, workspace, items, create_user):
        elsewhere = Project.objects.get(identifier="ELS")
        ProjectMember.objects.create(project=elsewhere, member=create_user, role=20, is_active=True)
        every = create(session_client, workspace, widgets=[{"title": "Items", "chart": "number"}])
        widget = every["widgets"][0]["id"]

        def counted(dashboard, **params):
            response = session_client.get(url(workspace, dashboard["id"], "data"), params)
            assert response.status_code == status.HTTP_200_OK, response.data
            return response.data["widgets"][widget]["value"]

        assert counted(every) == 5
        assert counted(every, project=str(items.id)) == 4
        # the project wins over projects the address tries
        assert counted(every, project=str(elsewhere.id), project_ids=str(items.id)) == 1

        # a dashboard that does not count the project is refused, for its numbers and for the editor's preview
        dash_only = create(session_client, workspace, project_ids=[str(items.id)])
        refused = session_client.get(url(workspace, dash_only["id"], "data"), {"project": str(elsewhere.id)})
        assert refused.status_code == status.HTTP_400_BAD_REQUEST
        assert "does not count" in refused.data["error"]

        def preview(project):
            return session_client.post(
                url(workspace, dash_only["id"], "preview"),
                {"chart": "number", "scope": {"project": project}},
                format="json",
            )

        assert preview(str(elsewhere.id)).status_code == status.HTTP_400_BAD_REQUEST
        assert preview(str(items.id)).data["value"] == 4
