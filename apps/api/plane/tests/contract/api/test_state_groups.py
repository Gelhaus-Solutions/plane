# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace state groups (E30): built-in rows, a state's category kept in step, the API, PQL and the migration."""

import importlib

import pytest
from django.apps import apps
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State, WorkspaceStateGroup
from plane.utils.state_groups import builtin_state_groups, default_states

MIGRATION = importlib.import_module("plane.db.migrations.0126_state_groups")


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Groups", identifier="GRP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.bulk_create(default_states(project, create_user))
    return project


def groups_url(workspace, suffix=""):
    return f"/api/v1/workspaces/{workspace.slug}/state-groups/{suffix}"


@pytest.mark.contract
class TestStateGroups:
    @pytest.mark.django_db
    def test_new_projects_get_a_review_state_in_the_review_group(self, project, workspace):
        review = State.objects.get(project=project, name="Review")
        assert (review.group, review.state_group.key) == ("started", "review")
        for state in State.objects.filter(project=project).exclude(name="Review"):
            assert state.state_group.key == state.group, state.name
        assert State.triage_objects.get(project=project).state_group is None

    @pytest.mark.django_db
    def test_a_state_keeps_its_category_and_group_in_step(self, project, workspace):
        groups = builtin_state_groups(workspace.id)
        waiting = WorkspaceStateGroup.objects.create(workspace=workspace, name="Waiting", category="started")

        state = State.objects.create(project=project, name="Blocked", color="#f00", group="unstarted")
        assert state.state_group == groups["unstarted"]

        state.state_group = waiting
        state.save()
        assert state.group == "started"

        state = State.objects.get(pk=state.pk)
        state.group = "completed"  # a client that only knows categories
        state.save()
        assert state.state_group == groups["completed"]

    @pytest.mark.django_db
    def test_the_api(self, api_key_client, project, workspace):
        listed = api_key_client.get(groups_url(workspace)).json()
        assert [g["key"] for g in listed] == ["backlog", "unstarted", "started", "review", "completed", "cancelled"]

        response = api_key_client.post(groups_url(workspace), {"name": "Waiting", "category": "started"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.content
        waiting = response.json()
        assert (waiting["key"], waiting["is_builtin"]) == (None, False)
        again = api_key_client.post(groups_url(workspace), {"name": "Waiting", "category": "backlog"}, format="json")
        assert again.status_code == status.HTTP_409_CONFLICT

        state = State.objects.get(project=project, name="Todo")
        url = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/states/{state.id}/"
        moved = api_key_client.patch(url, {"state_group": waiting["id"]}, format="json")
        assert moved.status_code == status.HTTP_200_OK, moved.content
        assert (moved.json()["group"], moved.json()["state_group"]) == ("started", waiting["id"])

        refused = api_key_client.delete(groups_url(workspace, f"{waiting['id']}/"))
        assert refused.status_code == status.HTTP_400_BAD_REQUEST and "move them" in refused.json()["error"]

        recategorised = api_key_client.patch(
            groups_url(workspace, f"{waiting['id']}/"), {"category": "backlog"}, format="json"
        )
        assert recategorised.status_code == status.HTTP_200_OK
        assert State.objects.get(pk=state.pk).group == "backlog"

        review = next(g for g in listed if g["key"] == "review")
        builtin = api_key_client.patch(
            groups_url(workspace, f"{review['id']}/"), {"category": "completed"}, format="json"
        )
        assert builtin.status_code == status.HTTP_400_BAD_REQUEST
        renamed = api_key_client.patch(groups_url(workspace, f"{review['id']}/"), {"name": "In review"}, format="json")
        assert renamed.status_code == status.HTTP_200_OK and renamed.json()["name"] == "In review"
        assert api_key_client.delete(groups_url(workspace, f"{review['id']}/")).status_code == 400

        api_key_client.patch(url, {"group": "unstarted"}, format="json")
        assert api_key_client.delete(groups_url(workspace, f"{waiting['id']}/")).status_code == 204

    @pytest.mark.django_db
    def test_pql_matches_a_group_by_name_and_its_category(self, api_key_client, project, workspace, create_user):
        review = State.objects.get(project=project, name="Review")
        doing = State.objects.get(project=project, name="In Progress")
        in_review = Issue.objects.create(name="Check", project=project, state=review, created_by=create_user)
        Issue.objects.create(name="Build", project=project, state=doing, created_by=create_user)
        url = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"

        found = api_key_client.get(url, {"pql": 'stateGroup = "Review"'}).json()["results"]
        assert [r["id"] for r in found] == [str(in_review.id)]
        started = api_key_client.get(url, {"pql": 'stateGroup = "started"'}).json()["results"]
        assert len(started) == 2
        unknown = api_key_client.get(url, {"pql": 'stateGroup = "Someday"'})
        assert unknown.status_code == status.HTTP_400_BAD_REQUEST and "not a state group" in str(unknown.content)

    @pytest.mark.django_db
    def test_the_migration_links_states_and_adds_review(self, workspace, create_user):
        project = Project.objects.create(name="Old", identifier="OLD", workspace=workspace, created_by=create_user)
        State.objects.bulk_create(
            [
                State(project=project, workspace=workspace, name="Todo", color="#ccc", group="unstarted", sequence=1),
                State(project=project, workspace=workspace, name="Doing", color="#ccc", group="started", sequence=2),
                State(project=project, workspace=workspace, name="Review", color="#ccc", group="completed", sequence=3),
            ]
        )
        # Tests run without migrations, so the live models stand in for the historical ones
        MIGRATION.forwards(apps, None)
        MIGRATION.forwards(apps, None)  # running twice changes nothing

        groups = {g.key: g for g in WorkspaceStateGroup.objects.filter(workspace=workspace)}
        assert sorted(groups) == ["backlog", "cancelled", "completed", "review", "started", "unstarted"]
        states = {s.name: s for s in State.objects.filter(project=project)}
        assert states["Todo"].state_group == groups["unstarted"]
        assert states["Review"].state_group == groups["completed"]  # a done-like "Review" keeps its meaning
        added = states["In Review"]
        assert (added.group, added.state_group) == ("started", groups["review"])
        assert State.objects.filter(project=project, state_group=groups["review"]).count() == 1
        assert [MIGRATION.review_sequence(*pair) for pair in ((2, 3), (2, None), (None, 3), (None, None))] == [
            2.5,
            1002,
            -997,
            40000,
        ]
