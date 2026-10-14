# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace priorities (E35): built-in rows, names on work items, the level kept in step, the API and PQL."""

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State
from plane.utils.state_groups import default_states


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Prio", identifier="PRI", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.bulk_create(default_states(project, create_user))
    return project


def priorities_url(workspace, suffix=""):
    return f"/api/v1/workspaces/{workspace.slug}/priorities/{suffix}"


def items_url(workspace, project, suffix=""):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/{suffix}"


@pytest.mark.contract
class TestPriorities:
    @pytest.mark.django_db
    def test_priorities_on_work_items(self, api_key_client, project, workspace):
        listed = api_key_client.get(priorities_url(workspace)).json()
        assert [p["key"] for p in listed] == ["urgent", "high", "medium", "low", "none"]

        response = api_key_client.post(priorities_url(workspace), {"name": "Blocker", "level": "urgent"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.content
        blocker = response.json()
        assert [p["name"] for p in api_key_client.get(priorities_url(workspace)).json()][:2] == ["Urgent", "Blocker"]

        made = api_key_client.post(items_url(workspace, project), {"name": "Fix", "priority": "blocker"}, format="json")
        assert made.status_code == status.HTTP_201_CREATED, made.content
        item = made.json()
        assert (item["priority"], item["priority_option"]) == ("urgent", blocker["id"])
        other = api_key_client.post(
            items_url(workspace, project), {"name": "Ship", "priority": "urgent"}, format="json"
        )
        assert other.json()["priority_option"] is None
        bad = api_key_client.post(items_url(workspace, project), {"name": "X", "priority": "Someday"}, format="json")
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

        def pql(query):
            return [
                r["name"] for r in api_key_client.get(items_url(workspace, project), {"pql": query}).json()["results"]
            ]

        assert pql('priority = "Blocker"') == ["Fix"]
        api_key_client.post(items_url(workspace, project), {"name": "Later", "priority": "high"}, format="json")
        ordered = api_key_client.get(items_url(workspace, project), {"order_by": "priority"}).json()["results"]
        assert [r["name"] for r in ordered] == ["Ship", "Fix", "Later"]  # urgent, then Blocker within urgent
        assert sorted(pql('priority = "urgent"')) == ["Fix", "Ship"]
        assert api_key_client.get(items_url(workspace, project), {"pql": 'priority = "Someday"'}).status_code == 400

        moved = api_key_client.patch(priorities_url(workspace, f"{blocker['id']}/"), {"level": "high"}, format="json")
        assert moved.status_code == status.HTTP_200_OK
        assert Issue.objects.get(pk=item["id"]).priority == "high"

        relevelled = api_key_client.patch(
            items_url(workspace, project, f"{item['id']}/"), {"priority": "low"}, format="json"
        )
        assert (relevelled.json()["priority"], relevelled.json()["priority_option"]) == ("low", None)
        again = api_key_client.patch(
            items_url(workspace, project, f"{item['id']}/"), {"priority_option": blocker["id"]}, format="json"
        )
        assert (again.json()["priority"], again.json()["priority_option"]) == ("high", blocker["id"])

        urgent = listed[0]
        assert (
            api_key_client.patch(
                priorities_url(workspace, f"{urgent['id']}/"), {"level": "low"}, format="json"
            ).status_code
            == 400
        )
        assert api_key_client.delete(priorities_url(workspace, f"{urgent['id']}/")).status_code == 400

        assert api_key_client.delete(priorities_url(workspace, f"{blocker['id']}/")).status_code == 204
        kept = Issue.objects.get(pk=item["id"])
        assert (kept.priority, kept.priority_option_id) == ("high", None)
