# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The app's project work item list accepts ?pql= next to ?filters=."""

import json

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="PQL App", identifier="PQP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issues(db, workspace, project, create_user):
    started = State.objects.create(name="Doing", group="started", project=project, workspace=workspace)
    done = State.objects.create(name="Done", group="completed", project=project, workspace=workspace)
    rows = (("open high", "high", started), ("open low", "low", started), ("done high", "high", done))
    return [
        Issue.objects.create(
            name=name, priority=priority, state=state, project=project, workspace=workspace, created_by=create_user
        )
        for name, priority, state in rows
    ]


def list_names(client, workspace, project, params):
    response = client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/", params)
    assert response.status_code == status.HTTP_200_OK, response.data
    results = response.data["results"] if isinstance(response.data, dict) else response.data
    return {item["name"] for item in results}


@pytest.mark.contract
class TestIssueListPQLApp:
    @pytest.mark.django_db
    def test_pql_filters_the_list(self, session_client, workspace, project, issues):
        names = list_names(session_client, workspace, project, {"pql": "stateGroup IN openStates()"})
        assert names == {"open high", "open low"}

    @pytest.mark.django_db
    def test_pql_and_filters_combine(self, session_client, workspace, project, issues):
        params = {"pql": "stateGroup IN openStates()", "filters": json.dumps({"priority": "high"})}
        assert list_names(session_client, workspace, project, params) == {"open high"}

    @pytest.mark.django_db
    def test_invalid_pql_returns_400(self, session_client, workspace, project, issues):
        response = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/", {"pql": "stateGroup IN"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["pql"]["code"] == "unexpected_token"
