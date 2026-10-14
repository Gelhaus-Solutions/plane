# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Custom work item properties (D39): definitions and options, values on work items, and PQL cf[...]."""

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State
from plane.utils.state_groups import default_states


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Props", identifier="PRP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.bulk_create(default_states(project, create_user))
    return project


@pytest.fixture
def items(project, create_user):
    return [
        Issue.objects.create(name=name, project=project, created_by=create_user) for name in ("One", "Two", "Three")
    ]


def props_url(workspace, suffix=""):
    return f"/api/v1/workspaces/{workspace.slug}/work-item-properties/{suffix}"


def value_url(workspace, project, item, prop):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/{item.id}/properties/{prop['id']}/"


def make(client, workspace, **body):
    response = client.post(props_url(workspace), body, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.content
    return response.json()


@pytest.mark.contract
class TestProperties:
    @pytest.mark.django_db
    def test_values_and_pql(self, api_key_client, workspace, project, items, create_user):
        severity = make(
            api_key_client,
            workspace,
            display_name="Severity",
            property_type="OPTION",
            options=[{"name": "High", "color": "#f00"}, {"name": "Low"}],
        )
        assert [o["name"] for o in severity["options"]] == ["High", "Low"]
        points = make(api_key_client, workspace, display_name="Points", property_type="DECIMAL")
        found = make(api_key_client, workspace, display_name="Found on", property_type="DATETIME")
        owner = make(api_key_client, workspace, display_name="Owner", property_type="RELATION", relation_type="USER")
        tags = make(api_key_client, workspace, display_name="CVE", property_type="TEXT", is_multi=True)
        flag = make(api_key_client, workspace, display_name="Customer facing", property_type="BOOLEAN")
        one, two, three = items

        def put(item, prop, value, expected=status.HTTP_200_OK):
            response = api_key_client.put(value_url(workspace, project, item, prop), {"value": value}, format="json")
            assert response.status_code == expected, response.content
            return response.json()

        assert put(one, severity, "high")["value"] == severity["options"][0]["id"]
        put(two, severity, severity["options"][1]["id"])
        assert "options are: High, Low" in put(three, severity, "Medium", status.HTTP_400_BAD_REQUEST)["error"]
        assert put(one, points, 8)["value"] == 8
        put(two, points, 2.5)
        assert put(one, found, "2026-10-01")["value"] == "2026-10-01"
        put(one, owner, str(create_user.id))
        assert put(one, tags, ["CVE-2026-1", "CVE-2026-2"])["value"] == ["CVE-2026-1", "CVE-2026-2"]
        put(two, flag, True)
        assert "takes one value" in put(three, points, [1, 2], status.HTTP_400_BAD_REQUEST)["error"]
        assert "takes true or false" in put(three, flag, "yes", status.HTTP_400_BAD_REQUEST)["error"]

        listed = api_key_client.get(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/{one.id}/properties/"
        ).json()
        assert listed[points["id"]]["value"] == 8 and listed[flag["id"]]["value"] is None

        url = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"

        def pql(query):
            response = api_key_client.get(url, {"pql": query})
            assert response.status_code == status.HTTP_200_OK, response.content
            return sorted(r["name"] for r in response.json()["results"])

        assert pql('cf["Severity"] = "High"') == ["One"]
        assert pql(f'cf["{severity["id"]}"] IN ("high", "low")') == ["One", "Two"]
        assert pql('cf["Points"] >= 3') == ["One"]
        assert pql('cf["Points"] BETWEEN 1 AND 3') == ["Two"]
        assert pql('cf["Found on"] < "2026-10-02"') == ["One"]
        assert pql('cf["Owner"] = currentUser()') == ["One"]
        assert pql('cf["CVE"] ~ "2026-2"') == ["One"]
        assert pql('cf["Customer facing"] = true') == ["Two"]
        assert pql('cf["Points"] IS EMPTY') == ["Three"]
        assert pql('cf["Severity"] != "High"') == ["Three", "Two"]
        bad = api_key_client.get(url, {"pql": 'cf["Nope"] = "x"'})
        assert bad.status_code == status.HTTP_400_BAD_REQUEST and "No custom property" in str(bad.content)
        wrong = api_key_client.get(url, {"pql": 'cf["Customer facing"] > 1'})
        assert wrong.status_code == status.HTTP_400_BAD_REQUEST

        # The type stays once values exist; an option or the property goes with its values
        changed = api_key_client.patch(
            props_url(workspace, f"{points['id']}/"), {"property_type": "TEXT"}, format="json"
        )
        assert changed.status_code == status.HTTP_400_BAD_REQUEST
        renamed = api_key_client.patch(
            props_url(workspace, f"{points['id']}/"), {"display_name": "Story points"}, format="json"
        )
        assert (renamed.json()["display_name"], renamed.json()["name"]) == ("Story points", "story-points")
        high = severity["options"][0]["id"]
        assert api_key_client.delete(props_url(workspace, f"{severity['id']}/options/{high}/")).status_code == 204
        assert pql('cf["Severity"] IS NOT EMPTY') == ["Two"]
        assert api_key_client.delete(props_url(workspace, f"{severity['id']}/")).status_code == 204
        assert make(api_key_client, workspace, display_name="Severity", property_type="TEXT")["name"] == "severity"
