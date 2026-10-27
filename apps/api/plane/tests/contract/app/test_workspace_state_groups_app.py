# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace state groups in the web app (E30): the settings page, a project's states inside them, and board columns."""

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Project, ProjectMember, State, User, Workspace, WorkspaceMember, WorkspaceStateGroup
from plane.utils.grouper import issue_group_values
from plane.utils.state_groups import builtin_state_groups, default_states


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Groups", identifier="GRP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.bulk_create(default_states(project, create_user))
    return project


@pytest.fixture
def waiting(db, workspace):
    builtin_state_groups(workspace.id)
    return WorkspaceStateGroup.objects.create(workspace=workspace, name="Waiting", category="started", sequence=42000)


@pytest.fixture
def member_client(db, workspace):
    """A plain workspace member, not an admin."""
    user = User.objects.create(email="member@plane.so", username="plain-member", first_name="Plain")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def groups_url(workspace, pk=None, suffix=""):
    return f"/api/workspaces/{workspace.slug}/state-groups/" + (f"{pk}/" if pk else "") + suffix


def states_url(workspace, project, pk=None):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/" + (f"{pk}/" if pk else "")


@pytest.mark.contract
class TestWorkspaceStateGroupsApp:
    @pytest.mark.django_db
    def test_listed_in_board_order_with_what_uses_them(self, session_client, workspace, project, waiting):
        State.objects.create(name="On vendor", project=project, workspace=workspace, state_group=waiting)

        listed = session_client.get(groups_url(workspace))

        assert listed.status_code == status.HTTP_200_OK
        rows = {row["name"]: row for row in listed.data}
        assert [row["name"] for row in listed.data] == [
            "Backlog",
            "Unstarted",
            "Started",
            "Review",
            "Waiting",
            "Completed",
            "Cancelled",
        ]
        assert (rows["Waiting"]["state_count"], rows["Waiting"]["project_count"]) == (1, 1)
        assert (rows["Review"]["is_builtin"], rows["Review"]["category"]) == (True, "started")

    @pytest.mark.django_db
    def test_members_read_and_admins_edit(self, session_client, member_client, workspace, project):
        assert member_client.get(groups_url(workspace)).status_code == status.HTTP_200_OK
        refused = member_client.post(groups_url(workspace), {"name": "Mine", "category": "started"}, format="json")
        assert refused.status_code == status.HTTP_403_FORBIDDEN

        made = session_client.post(groups_url(workspace), {"name": "Waiting", "category": "started"}, format="json")
        assert made.status_code == status.HTTP_201_CREATED, made.data
        assert (made.data["is_builtin"], made.data["state_count"], made.data["project_count"]) == (False, 0, 0)
        again = session_client.post(groups_url(workspace), {"name": "Waiting", "category": "started"}, format="json")
        assert again.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_a_new_category_moves_its_states(self, session_client, workspace, project, waiting):
        state = State.objects.create(name="On vendor", project=project, workspace=workspace, state_group=waiting)

        moved = session_client.patch(groups_url(workspace, waiting.id), {"category": "unstarted"}, format="json")

        assert moved.status_code == status.HTTP_200_OK, moved.data
        assert moved.data["state_count"] == 1
        state.refresh_from_db()
        assert state.group == "unstarted"

    @pytest.mark.django_db
    def test_a_built_in_group_keeps_its_category_and_stays(self, session_client, workspace, project):
        review = builtin_state_groups(workspace.id)["review"]

        assert (
            session_client.patch(groups_url(workspace, review.id), {"category": "completed"}, format="json").status_code
            == 400
        )
        renamed = session_client.patch(groups_url(workspace, review.id), {"name": "In review"}, format="json")
        assert (renamed.status_code, renamed.data["name"]) == (200, "In review")
        assert session_client.delete(groups_url(workspace, review.id)).status_code == 400

    @pytest.mark.django_db
    def test_delete_moves_every_state_first(self, session_client, workspace, project, waiting):
        groups = builtin_state_groups(workspace.id)
        vendor = State.objects.create(name="On vendor", project=project, workspace=workspace, state_group=waiting)
        enno = State.objects.create(name="On Enno", project=project, workspace=workspace, state_group=waiting)
        item = Issue.objects.create(name="Fix", project=project, workspace=workspace, state=vendor)

        listed = session_client.get(groups_url(workspace, waiting.id, "states/"))
        assert {(row["name"], row["issue_count"]) for row in listed.data} == {("On vendor", 1), ("On Enno", 0)}

        partial = session_client.delete(
            groups_url(workspace, waiting.id), {"moves": {str(vendor.id): str(groups["started"].id)}}, format="json"
        )
        assert partial.status_code == status.HTTP_400_BAD_REQUEST
        assert partial.data["state_id"] == str(enno.id)

        done = session_client.delete(
            groups_url(workspace, waiting.id),
            {"moves": {str(vendor.id): str(groups["started"].id), str(enno.id): str(groups["review"].id)}},
            format="json",
        )
        assert done.status_code == status.HTTP_204_NO_CONTENT
        assert not WorkspaceStateGroup.objects.filter(pk=waiting.pk).exists()
        vendor.refresh_from_db()
        enno.refresh_from_db()
        item.refresh_from_db()
        assert (vendor.state_group_id, vendor.group) == (groups["started"].id, "started")
        assert (enno.state_group_id, enno.group) == (groups["review"].id, "started")
        assert item.state_id == vendor.id

    @pytest.mark.django_db
    def test_delete_names_the_states_of_archived_projects_too(self, session_client, workspace, project, waiting):
        groups = builtin_state_groups(workspace.id)
        project.archived_at = timezone.now()
        project.save()
        shelved = State.objects.create(name="Shelved", project=project, workspace=workspace, state_group=waiting)

        listed = session_client.get(groups_url(workspace, waiting.id, "states/"))
        assert [row["id"] for row in listed.data] == [str(shelved.id)]

        done = session_client.delete(
            groups_url(workspace, waiting.id), {"moves": {str(shelved.id): str(groups["started"].id)}}, format="json"
        )
        assert done.status_code == status.HTTP_204_NO_CONTENT
        shelved.refresh_from_db()
        assert shelved.state_group_id == groups["started"].id

    @pytest.mark.django_db
    def test_a_project_state_goes_into_a_group(self, session_client, workspace, project, waiting, create_user):
        made = session_client.post(
            states_url(workspace, project),
            {"name": "On vendor", "color": "#F59E0B", "group": "backlog", "state_group": str(waiting.id)},
            format="json",
        )
        assert made.status_code == status.HTTP_200_OK, made.data
        assert (made.data["group"], str(made.data["state_group"])) == ("started", str(waiting.id))

        other = Workspace.objects.create(name="Other", slug="other-groups", owner=create_user)
        foreign = WorkspaceStateGroup.objects.create(workspace=other, name="Theirs", category="started")
        refused = session_client.patch(
            states_url(workspace, project, made.data["id"]), {"state_group": str(foreign.id)}, format="json"
        )
        assert refused.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_board_columns_are_the_groups_a_project_uses(self, workspace, project, waiting):
        groups = builtin_state_groups(workspace.id)

        in_project = issue_group_values("state__state_group_id", workspace.slug, project_id=project.id)
        everywhere = issue_group_values("state__state_group_id", workspace.slug)

        assert str(waiting.id) not in in_project
        assert in_project[:4] == [str(groups[key].id) for key in ("backlog", "unstarted", "started", "review")]
        assert str(waiting.id) in everywhere

    @pytest.mark.django_db
    def test_the_board_groups_its_items_by_state_group(self, session_client, workspace, project, waiting):
        groups = builtin_state_groups(workspace.id)
        vendor = State.objects.create(name="On vendor", project=project, workspace=workspace, state_group=waiting)
        Issue.objects.create(name="Fix", project=project, workspace=workspace, state=vendor)
        backlog = State.objects.get(project=project, name="Backlog")
        Issue.objects.create(name="Someday", project=project, workspace=workspace, state=backlog)

        board = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
            {"group_by": "state__state_group_id", "layout": "kanban", "per_page": 30, "cursor": "30:0:0"},
        )

        assert board.status_code == status.HTTP_200_OK
        columns = board.data["results"]
        assert str(waiting.id) in columns and str(groups["review"].id) in columns
        assert [row["name"] for row in columns[str(waiting.id)]["results"]] == ["Fix"]

        # a column's next page asks for its group alone
        page = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
            {"state_group_id": str(waiting.id), "per_page": 30, "cursor": "30:0:0"},
        )
        assert [row["name"] for row in page.data["results"]] == ["Fix"]
