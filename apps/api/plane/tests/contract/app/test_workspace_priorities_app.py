# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace priorities in the web app (E35): the settings editor and a work item naming one of them."""

import json

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks.issue_activities_task import update_issue_activity
from plane.db.models import Issue, Project, ProjectMember, State, User, Workspace, WorkspaceMember, WorkspacePriority
from plane.utils.priorities import builtin_priorities


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Prio", identifier="PRI", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.create(name="Todo", group="unstarted", default=True, project=project, workspace=workspace)
    return project


@pytest.fixture
def member_client(db, workspace):
    """A plain workspace member, not an admin."""
    user = User.objects.create(email="member@plane.so", username="plain-member", first_name="Plain")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def priorities_url(workspace, pk=None):
    return f"/api/workspaces/{workspace.slug}/priorities/" + (f"{pk}/" if pk else "")


def item_url(workspace, project, pk=None):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/" + (f"{pk}/" if pk else "")


@pytest.mark.contract
class TestWorkspacePrioritiesApp:
    @pytest.mark.django_db
    def test_listed_by_level_with_what_uses_them(self, session_client, workspace, project, create_user):
        builtin = builtin_priorities(workspace.id)
        blocker = WorkspacePriority.objects.create(workspace=workspace, name="Blocker", level="urgent", sequence=1)
        Issue.objects.create(name="Plain", project=project, workspace=workspace, priority="urgent")
        Issue.objects.create(name="Named", project=project, workspace=workspace, priority_option=blocker)
        Issue.objects.create(name="High", project=project, workspace=workspace, priority="high")

        listed = session_client.get(priorities_url(workspace))

        assert listed.status_code == status.HTTP_200_OK
        rows = [(row["name"], row["level"], row["is_builtin"], row["issue_count"]) for row in listed.data]
        # the built-in first in its level even though the custom one has the lower sequence
        assert rows[:3] == [("Urgent", "urgent", True, 1), ("Blocker", "urgent", False, 1), ("High", "high", True, 1)]
        assert [row["name"] for row in listed.data][3:] == ["Medium", "Low", "None"]
        assert str(listed.data[0]["id"]) == str(builtin["urgent"].id)

    @pytest.mark.django_db
    def test_members_read_and_admins_edit(self, session_client, member_client, workspace, project):
        assert member_client.get(priorities_url(workspace)).status_code == status.HTTP_200_OK
        refused = member_client.post(priorities_url(workspace), {"name": "Mine", "level": "low"}, format="json")
        assert refused.status_code == status.HTTP_403_FORBIDDEN

        made = session_client.post(
            priorities_url(workspace),
            {"name": "Someday", "level": "low", "color": "#8B5CF6", "icon": "moon"},
            format="json",
        )
        assert made.status_code == status.HTTP_201_CREATED, made.data
        assert (made.data["is_builtin"], made.data["issue_count"], made.data["icon"]) == (False, 0, "moon")

        twice = session_client.post(priorities_url(workspace), {"name": "Someday", "level": "low"}, format="json")
        assert twice.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_a_new_level_moves_its_items(self, session_client, workspace, project):
        blocker = WorkspacePriority.objects.create(workspace=workspace, name="Blocker", level="urgent")
        item = Issue.objects.create(name="Named", project=project, workspace=workspace, priority_option=blocker)

        moved = session_client.patch(priorities_url(workspace, blocker.id), {"level": "high"}, format="json")

        assert moved.status_code == status.HTTP_200_OK, moved.data
        assert moved.data["issue_count"] == 1
        item.refresh_from_db()
        assert (item.priority, item.priority_option_id) == ("high", blocker.id)

    @pytest.mark.django_db
    def test_built_in_is_only_renamed_and_never_deleted(self, session_client, workspace):
        urgent = builtin_priorities(workspace.id)["urgent"]

        moved = session_client.patch(priorities_url(workspace, urgent.id), {"level": "low"}, format="json")
        assert moved.status_code == status.HTTP_400_BAD_REQUEST
        renamed = session_client.patch(priorities_url(workspace, urgent.id), {"name": "Now"}, format="json")
        assert (renamed.status_code, renamed.data["name"], renamed.data["level"]) == (200, "Now", "urgent")
        assert session_client.delete(priorities_url(workspace, urgent.id)).status_code == 400

    @pytest.mark.django_db
    def test_delete_returns_items_to_their_level(self, session_client, workspace, project):
        blocker = WorkspacePriority.objects.create(workspace=workspace, name="Blocker", level="urgent")
        item = Issue.objects.create(name="Named", project=project, workspace=workspace, priority_option=blocker)

        assert session_client.delete(priorities_url(workspace, blocker.id)).status_code == status.HTTP_204_NO_CONTENT

        item.refresh_from_db()
        assert (item.priority, item.priority_option_id) == ("urgent", None)

    @pytest.mark.django_db
    def test_a_work_item_names_a_priority_and_takes_its_level(self, session_client, workspace, project):
        blocker = WorkspacePriority.objects.create(workspace=workspace, name="Blocker", level="urgent")
        item = Issue.objects.create(name="Fix", project=project, workspace=workspace, priority="low")

        named = session_client.patch(
            item_url(workspace, project, item.id), {"priority_option_id": str(blocker.id)}, format="json"
        )
        assert named.status_code == status.HTTP_204_NO_CONTENT, named.data
        item.refresh_from_db()
        assert (item.priority, item.priority_option_id) == ("urgent", blocker.id)

        listed = session_client.get(item_url(workspace, project))
        row = next(row for row in listed.data["results"] if str(row["id"]) == str(item.id))
        assert (row["priority"], str(row["priority_option_id"])) == ("urgent", str(blocker.id))
        detail = session_client.get(item_url(workspace, project, item.id))
        assert str(detail.data["priority_option_id"]) == str(blocker.id)

        # a level alone, as the web sends for a built-in priority, lets the custom one go
        session_client.patch(
            item_url(workspace, project, item.id), {"priority": "high", "priority_option_id": None}, format="json"
        )
        item.refresh_from_db()
        assert (item.priority, item.priority_option_id) == ("high", None)

    @pytest.mark.django_db
    def test_a_priority_of_another_workspace_is_refused(self, session_client, workspace, project, create_user):
        other = Workspace.objects.create(name="Other", slug="other-prio", owner=create_user)
        foreign = WorkspacePriority.objects.create(workspace=other, name="Theirs", level="urgent")
        item = Issue.objects.create(name="Fix", project=project, workspace=workspace)

        refused = session_client.patch(
            item_url(workspace, project, item.id), {"priority_option_id": str(foreign.id)}, format="json"
        )

        assert refused.status_code == status.HTTP_400_BAD_REQUEST
        item.refresh_from_db()
        assert item.priority_option_id is None


def _priority_activity(issue, current, requested):
    entries = []
    update_issue_activity(
        requested_data=json.dumps(requested),
        current_instance=json.dumps(current),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        workspace_id=str(issue.workspace_id),
        actor_id=None,
        issue_activities=entries,
        epoch=0,
    )
    return [(entry.field, entry.old_value, entry.new_value) for entry in entries]


@pytest.mark.contract
class TestPriorityActivity:
    @pytest.mark.django_db
    def test_a_named_priority_is_logged_once_by_name(self, workspace, project):
        urgent = builtin_priorities(workspace.id)["urgent"]
        blocker = WorkspacePriority.objects.create(workspace=workspace, name="Blocker", level="urgent")
        item = Issue.objects.create(name="Fix", project=project, workspace=workspace, priority="urgent")
        plain = {"priority": "urgent", "priority_option_id": None}

        # the same level, a custom priority: one entry, by name
        assert _priority_activity(item, plain, {"priority": "urgent", "priority_option_id": str(blocker.id)}) == [
            ("priority", "urgent", "Blocker")
        ]
        # back to the built-in one of the level
        named = {"priority": "urgent", "priority_option_id": str(blocker.id)}
        assert _priority_activity(item, named, {"priority": "urgent", "priority_option_id": None}) == [
            ("priority", "Blocker", "urgent")
        ]
        # naming the built-in row changes nothing a person can see
        assert _priority_activity(item, plain, {"priority": "urgent", "priority_option_id": str(urgent.id)}) == []
        # a level alone, as agents and older clients send it, logs as before
        assert _priority_activity(item, plain, {"priority": "high"}) == [("priority", "urgent", "high")]
