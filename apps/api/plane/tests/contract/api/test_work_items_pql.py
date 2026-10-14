# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""GET /api/v1/workspaces/{slug}/projects/{project_id}/issues/?pql=..."""

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="PQL API", identifier="PQA", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issues(db, workspace, project, create_user):
    state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=workspace, default=True)
    return [
        Issue.objects.create(
            name=name, priority=priority, state=state, project=project, workspace=workspace, created_by=create_user
        )
        for name, priority in (("first", "high"), ("second", "low"), ("third", "high"))
    ]


def url(workspace, project):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/issues/"


@pytest.mark.contract
class TestWorkItemListPQL:
    @pytest.mark.django_db
    def test_pql_filters_results_and_total(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(url(workspace, project), {"pql": 'priority = "high"'})

        assert response.status_code == status.HTTP_200_OK, response.data
        assert {item["name"] for item in response.data["results"]} == {"first", "third"}
        assert response.data["total_count"] == 2

    @pytest.mark.django_db
    def test_invalid_pql_returns_400_with_position(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(url(workspace, project), {"pql": "priority = high"})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["pql"]["code"] == "unquoted_value"
        assert response.data["pql"]["position"] == 11

    @pytest.mark.django_db
    def test_unknown_field_returns_400(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(url(workspace, project), {"pql": 'colour = "red"'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["pql"]["code"] == "unknown_field"

    @pytest.mark.django_db
    def test_structured_filters_are_refused(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(url(workspace, project), {"filters": '{"priority": "high"}'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_without_pql_lists_everything(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(url(workspace, project))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_count"] == 3


@pytest.fixture
def second_project(db, workspace, create_user):
    project = Project.objects.create(name="PQL API 2", identifier="PQB", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    state = State.objects.create(name="Doing", group="started", project=project, workspace=workspace, default=True)
    Issue.objects.create(
        name="elsewhere", priority="high", state=state, project=project, workspace=workspace, created_by=create_user
    )
    return project


@pytest.fixture
def hidden_project(db, workspace, create_user):
    """A project the caller is not a member of."""
    project = Project.objects.create(name="Hidden", identifier="HID", workspace=workspace, created_by=create_user)
    state = State.objects.create(name="Doing", group="started", project=project, workspace=workspace, default=True)
    Issue.objects.create(
        name="secret", priority="high", state=state, project=project, workspace=workspace, created_by=create_user
    )
    return project


@pytest.mark.contract
class TestWorkspaceWorkItemsPQL:
    @pytest.mark.django_db
    def test_workspace_list_spans_member_projects_only(
        self, api_key_client, workspace, project, issues, second_project, hidden_project
    ):
        response = api_key_client.get(f"/api/v1/workspaces/{workspace.slug}/work-items/", {"pql": 'priority = "high"'})

        assert response.status_code == status.HTTP_200_OK, response.data
        assert {item["name"] for item in response.data["results"]} == {"first", "third", "elsewhere"}
        assert response.data["total_count"] == 3

    @pytest.mark.django_db
    def test_archived_list(self, api_key_client, workspace, project, issues):
        Issue.objects.filter(pk=issues[1].pk).update(archived_at="2026-10-01")
        response = api_key_client.get(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/archived-work-items/",
            {"pql": 'priority = "low"'},
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert [item["name"] for item in response.data["results"]] == ["second"]

    @pytest.mark.django_db
    def test_count_with_groups(self, api_key_client, workspace, project, issues, second_project, hidden_project):
        response = api_key_client.get(
            f"/api/v1/workspaces/{workspace.slug}/work-items/count/",
            {"pql": "stateGroup IN openStates()", "group_by": "priority", "sub_group_by": "project_id"},
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["total_count"] == 4
        assert response.data["grouped_by"] == "priority"
        assert response.data["sub_grouped_by"] == "project_id"
        assert response.data["grouped_counts"] == {
            "high": {
                "count": 3,
                "sub_grouped_counts": {str(project.id): {"count": 2}, str(second_project.id): {"count": 1}},
            },
            "low": {"count": 1, "sub_grouped_counts": {str(project.id): {"count": 1}}},
        }

    @pytest.mark.django_db
    def test_count_without_groups(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(f"/api/v1/workspaces/{workspace.slug}/work-items/count/", {"pql": "hasNoLabel()"})

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data == {"total_count": 3, "grouped_by": None, "sub_grouped_by": None, "grouped_counts": {}}

    @pytest.mark.django_db
    def test_count_rejects_unknown_group(self, api_key_client, workspace, project, issues):
        response = api_key_client.get(
            f"/api/v1/workspaces/{workspace.slug}/work-items/count/", {"group_by": "milestone_id"}
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
