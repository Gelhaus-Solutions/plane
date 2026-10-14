# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace priorities (E35): the built-in five and the workspace's own, each at one of the five levels (D38)."""

from django.db import IntegrityError, transaction
from django.db.models import Case, Count, IntegerField, Q, Value, When
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from plane.api.serializers import WorkspacePrioritySerializer
from plane.app.permissions import WorkspaceEntityPermission, WorkspaceOwnerPermission
from plane.db.models import Issue, Workspace, WorkspacePriority
from plane.db.models.priority import LEVEL_RANK
from plane.utils.priorities import builtin_priorities

from .base import BaseAPIView

LEVEL_ORDER = Case(
    *[When(level=level, then=Value(rank)) for level, rank in LEVEL_RANK.items()], output_field=IntegerField()
)


class _PriorityPermissions:
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [WorkspaceEntityPermission()]
        return [WorkspaceOwnerPermission()]


class PriorityListCreateAPIEndpoint(_PriorityPermissions, BaseAPIView):
    model = WorkspacePriority
    serializer_class = WorkspacePrioritySerializer

    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        builtin_priorities(workspace.id)
        priorities = (
            WorkspacePriority.objects.filter(workspace=workspace)
            .annotate(issue_count=Count("issues", filter=Q(issues__deleted_at__isnull=True)))
            .order_by(LEVEL_ORDER, "sequence", "created_at")
        )
        return Response(WorkspacePrioritySerializer(priorities, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        builtin_priorities(workspace.id)  # the built-in names are taken first
        serializer = WorkspacePrioritySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                serializer.save(workspace=workspace, key=None, is_builtin=False)
        except IntegrityError:
            existing = WorkspacePriority.objects.filter(workspace=workspace, name=request.data.get("name")).first()
            return Response(
                {"error": "A priority with this name already exists", "id": str(existing.id) if existing else None},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PriorityDetailAPIEndpoint(_PriorityPermissions, BaseAPIView):
    """A built-in priority can be renamed, recoloured and given an icon, never deleted or moved to another level."""

    model = WorkspacePriority
    serializer_class = WorkspacePrioritySerializer

    def _priority(self, slug, pk):
        return WorkspacePriority.objects.get(workspace__slug=slug, pk=pk)

    def get(self, request, slug, pk):
        return Response(WorkspacePrioritySerializer(self._priority(slug, pk)).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, pk):
        priority = self._priority(slug, pk)
        level = request.data.get("level")
        if priority.is_builtin and level is not None and level != priority.level:
            return Response({"error": "A built-in priority keeps its level"}, status=status.HTTP_400_BAD_REQUEST)
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
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug, pk):
        priority = self._priority(slug, pk)
        if priority.is_builtin:
            return Response({"error": "A built-in priority cannot be deleted"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            # Its work items keep their level and show that level's built-in priority again
            Issue.all_objects.filter(priority_option=priority).update(priority_option=None)
            priority.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
