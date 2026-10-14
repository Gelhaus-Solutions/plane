# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""A user's project properties keep the PQL query their list shows (D42)."""

import pytest
from rest_framework import status

from plane.db.models import Project, ProjectMember, ProjectUserProperty


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="PQL Props", identifier="PQR", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/user-properties/"


@pytest.mark.contract
class TestProjectUserPropertyPQL:
    @pytest.mark.django_db
    def test_starts_empty(self, session_client, workspace, project):
        response = session_client.get(url(workspace, project))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["pql"] == ""

    @pytest.mark.django_db
    def test_keeps_the_query(self, session_client, workspace, project, create_user):
        query = "stateGroup IN openStates() AND priority = high"
        response = session_client.patch(url(workspace, project), {"pql": query}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["pql"] == query
        assert ProjectUserProperty.objects.get(user=create_user, project=project).pql == query

    @pytest.mark.django_db
    def test_a_patch_without_pql_leaves_it(self, session_client, workspace, project):
        session_client.patch(url(workspace, project), {"pql": "priority = high"}, format="json")
        response = session_client.patch(url(workspace, project), {"rich_filters": {}}, format="json")
        assert response.data["pql"] == "priority = high"

    @pytest.mark.django_db
    def test_clears_the_query(self, session_client, workspace, project):
        session_client.patch(url(workspace, project), {"pql": "priority = high"}, format="json")
        response = session_client.patch(url(workspace, project), {"pql": ""}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["pql"] == ""
