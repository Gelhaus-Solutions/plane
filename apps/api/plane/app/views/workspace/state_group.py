# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace state groups for the web app (E30): the settings page (r9-17), the project states page (r9-18) and the
board columns.

Everyone in the workspace reads them; admins add, change and delete them. A built-in group keeps its category and is
never deleted. A custom group is deleted once each of its states has moved to another group, so no item loses its
state.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import WorkspaceStateGroupSerializer
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, State, Workspace, WorkspaceStateGroup
from plane.utils.state_groups import builtin_state_groups

# The states a group holds: the projects' own, not triage, not in an archived or deleted project
LIVE_STATES = Q(states__deleted_at__isnull=True, states__is_triage=False, states__project__archived_at__isnull=True)


def _listed(workspace):
    builtin_state_groups(workspace.id)
    return (
        WorkspaceStateGroup.objects.filter(workspace=workspace)
        .annotate(
            state_count=Count("states", filter=LIVE_STATES, distinct=True),
            project_count=Count("states__project", filter=LIVE_STATES, distinct=True),
        )
        .order_by("sequence", "created_at")
    )


def _data(group):
    data = WorkspaceStateGroupSerializer(group).data
    data["project_count"] = getattr(group, "project_count", 0)
    return data


def _group(slug, pk):
    return WorkspaceStateGroup.objects.filter(workspace__slug=slug, pk=pk).first()


class WorkspaceStateGroupsEndpoint(BaseAPIView):
    """The workspace's state groups in board order, each with how many projects and states use it."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        return Response([_data(group) for group in _listed(workspace)], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        builtin_state_groups(workspace.id)  # the built-in names are taken first
        serializer = WorkspaceStateGroupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                group = serializer.save(workspace=workspace, key=None, is_builtin=False)
        except IntegrityError:
            return Response({"error": "A state group with this name already exists"}, status=status.HTTP_409_CONFLICT)
        group.state_count = group.project_count = 0
        return Response(_data(group), status=status.HTTP_201_CREATED)


class WorkspaceStateGroupDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        group = _group(slug, pk)
        if group is None:
            return Response({"error": "State group not found"}, status=status.HTTP_404_NOT_FOUND)
        category = request.data.get("category")
        if group.is_builtin and category is not None and category != group.category:
            return Response({"error": "A built-in state group keeps its category"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WorkspaceStateGroupSerializer(group, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                group = serializer.save()
                # A state's group is its state group's category (D36), so a new category moves its states with it
                State.all_state_objects.filter(state_group=group).exclude(group=group.category).update(
                    group=group.category
                )
        except IntegrityError:
            return Response({"error": "A state group with this name already exists"}, status=status.HTTP_409_CONFLICT)
        return Response(_data(_listed(group.workspace).get(pk=group.pk)), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        """``moves`` names, for each state in the group, the group it goes to; all of them move, then the group goes."""
        group = _group(slug, pk)
        if group is None:
            return Response({"error": "State group not found"}, status=status.HTTP_404_NOT_FOUND)
        if group.is_builtin:
            return Response({"error": "A built-in state group cannot be deleted"}, status=status.HTTP_400_BAD_REQUEST)
        moves = request.data.get("moves") or {}
        states = list(State.objects.filter(state_group=group))
        targets = {
            str(target.id): target
            for target in WorkspaceStateGroup.objects.filter(workspace_id=group.workspace_id).exclude(pk=group.pk)
        }
        for state in states:
            if str(moves.get(str(state.id), "")) not in targets:
                return Response(
                    {"error": f"Name the group the state {state.name} moves to", "state_id": str(state.id)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        with transaction.atomic():
            for state in states:
                state.state_group = targets[str(moves[str(state.id)])]
                state.save()  # the state takes the new group's category
            group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceStateGroupStatesEndpoint(BaseAPIView):
    """The states in a group across the workspace's projects, with how many items each holds: what a delete moves."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk):
        group = _group(slug, pk)
        if group is None:
            return Response({"error": "State group not found"}, status=status.HTTP_404_NOT_FOUND)
        # Archived projects' states too: the delete moves every state in the group
        states = State.objects.filter(state_group=group).select_related("project").order_by("project__name", "sequence")
        counts = {
            row["state_id"]: row["count"]
            for row in Issue.issue_objects.filter(state__in=states).values("state_id").annotate(count=Count("id"))
        }
        return Response(
            [
                {
                    "id": str(state.id),
                    "name": state.name,
                    "color": state.color,
                    "project": {
                        "id": str(state.project_id),
                        "name": state.project.name,
                        "identifier": state.project.identifier,
                    },
                    "issue_count": counts.get(state.id, 0),
                }
                for state in states
            ],
            status=status.HTTP_200_OK,
        )
