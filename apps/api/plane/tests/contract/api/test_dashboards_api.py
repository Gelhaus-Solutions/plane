# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dashboards on the public API (E23): the same rules as the app, behind a key."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Project, ProjectMember, State


def ago(days):
    return timezone.now() - timedelta(days=days)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Dash", identifier="DSH", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    states = {
        group: State.objects.create(name=group.title(), group=group, project=project, workspace=workspace)
        for group in ("backlog", "completed")
    }
    for name, group, created, done in (
        ("old", "completed", 30, 20),
        ("open", "backlog", 5, None),
        ("done", "completed", 10, 2),
    ):
        issue = Issue.objects.create(
            name=name, state=states[group], project=project, workspace=workspace, created_by=create_user
        )
        Issue.objects.filter(pk=issue.pk).update(created_at=ago(created), completed_at=ago(done) if done else None)
    return project


def url(workspace, *parts):
    return "/".join([f"/api/v1/workspaces/{workspace.slug}/dashboards", *parts, ""])


@pytest.mark.contract
class TestDashboardsAPI:
    @pytest.mark.django_db
    def test_a_chart_without_a_dashboard(self, api_key_client, workspace, project):
        response = api_key_client.post(
            url(workspace, "chart"),
            {"chart": "line", "config": {"measure": "running", "x_axis": "created_resolved"}, "period": "2w"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        series = {s["key"]: s["values"] for s in response.data["series"]}
        assert (series["total"][0], series["total"][-1]) == (1, 3)
        assert (series["resolved"][0], series["resolved"][-1]) == (1, 2)
        assert response.data["matched"] == 3

    @pytest.mark.django_db
    def test_a_bad_chart_or_period_is_refused(self, api_key_client, workspace, project):
        assert api_key_client.post(url(workspace, "chart"), {"chart": "pie"}, format="json").status_code == 400
        bad_period = api_key_client.post(url(workspace, "chart"), {"chart": "number", "period": "1y"}, format="json")
        assert bad_period.status_code == 400

    @pytest.mark.django_db
    def test_build_a_dashboard_and_read_its_numbers(self, api_key_client, workspace, project):
        dashboard = api_key_client.post(url(workspace), {"name": "Ops", "period": "6w"}, format="json").data
        widget = api_key_client.post(
            url(workspace, dashboard["id"], "widgets"),
            {"title": "Resolved", "chart": "number", "config": {"measure": "resolved"}},
            format="json",
        ).data
        data = api_key_client.get(url(workspace, dashboard["id"], "data"), {"period": "2w"}).data
        assert data["widgets"][widget["id"]]["value"] == 1
        assert [d["name"] for d in api_key_client.get(url(workspace)).data] == ["Ops"]

    @pytest.mark.django_db
    def test_a_project_lens_on_dashboards(self, api_key_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=other, member=create_user, role=20, is_active=True)
        mine = api_key_client.post(url(workspace), {"name": "Dash", "project_ids": [str(project.id)]}, format="json")
        api_key_client.post(url(workspace), {"name": "Other", "project_ids": [str(other.id)]}, format="json")
        listed = api_key_client.get(url(workspace), {"project": str(project.id)}).data
        assert [(d["name"], d["project_ids"]) for d in listed] == [("Dash", [str(project.id)])]

        data = url(workspace, mine.data["id"], "data")
        assert api_key_client.get(data, {"project": str(project.id)}).status_code == status.HTTP_200_OK
        assert api_key_client.get(data, {"project": str(other.id)}).status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_no_key_no_dashboards(self, workspace):
        assert APIClient().get(url(workspace)).status_code == status.HTTP_401_UNAUTHORIZED
