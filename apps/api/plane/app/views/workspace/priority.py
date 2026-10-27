# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace priorities for the web app (E35): the settings editor (r15-01) and the pickers.

Everyone in the workspace reads them; admins add, change and delete them. A built-in priority can be renamed,
never deleted or moved to another level (D38).
"""

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import WorkspacePrioritySerializer
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, Workspace, WorkspacePriority
from plane.db.models.priority import LEVEL_RANK
from plane.utils.priorities import builtin_priorities, item_counts


def _listed(workspace):
    builtin_priorities(workspace.id)
    counts = item_counts(workspace.id)
    rows = sorted(
        WorkspacePriority.objects.filter(workspace=workspace),
        key=lambda row: (LEVEL_RANK.get(row.level, len(LEVEL_RANK)), not row.is_builtin, row.sequence, row.created_at),
    )
    for row in rows:
        row.issue_count = counts.get(row.id, 0)
    return rows


class WorkspacePrioritiesEndpoint(BaseAPIView):
    """The workspace's priorities by level, the built-in one first in each, with how many items show each."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        return Response(WorkspacePrioritySerializer(_listed(workspace), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        builtin_priorities(workspace.id)  # the built-in names are taken first
        serializer = WorkspacePrioritySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                priority = serializer.save(workspace=workspace, key=None, is_builtin=False)
        except IntegrityError:
            return Response({"error": "A priority with this name already exists"}, status=status.HTTP_409_CONFLICT)
        priority.issue_count = 0
        return Response(WorkspacePrioritySerializer(priority).data, status=status.HTTP_201_CREATED)


class WorkspacePriorityDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        priority = WorkspacePriority.objects.filter(workspace__slug=slug, pk=pk).first()
        if priority is None:
            return Response({"error": "Priority not found"}, status=status.HTTP_404_NOT_FOUND)
        if priority.is_builtin and set(request.data) - {"name"}:
            return Response({"error": "A built-in priority can only be renamed"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WorkspacePrioritySerializer(priority, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                priority = serializer.save()
                # Work items keep the level of their priority, so a new level moves them with it
                Issue.all_objects.filter(priority_option=priority).exclude(priority=priority.level).update(
                    priority=priority.level
                )
        except IntegrityError:
            return Response({"error": "A priority with this name already exists"}, status=status.HTTP_409_CONFLICT)
        priority.issue_count = item_counts(priority.workspace_id).get(priority.id, 0)
        return Response(WorkspacePrioritySerializer(priority).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        priority = WorkspacePriority.objects.filter(workspace__slug=slug, pk=pk).first()
        if priority is None:
            return Response({"error": "Priority not found"}, status=status.HTTP_404_NOT_FOUND)
        if priority.is_builtin:
            return Response({"error": "A built-in priority cannot be deleted"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            # Its work items keep their level and show that level's built-in priority again
            Issue.all_objects.filter(priority_option=priority).update(priority_option=None)
            priority.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
