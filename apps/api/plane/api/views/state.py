# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction
from django.db.models import Count, Q

# Third party imports
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse, OpenApiRequest

# Module imports
from plane.api.serializers import StateSerializer, WorkspaceStateGroupSerializer
from plane.app.permissions import (
    ProjectAdminPermission,
    ProjectEntityPermission,
    WorkspaceEntityPermission,
    WorkspaceOwnerPermission,
)
from plane.db.models import Issue, State, Workspace, WorkspaceStateGroup
from plane.utils.state_groups import builtin_state_groups
from .base import BaseAPIView
from plane.utils.openapi import (
    state_docs,
    STATE_ID_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    create_paginated_response,
    # Request Examples
    STATE_CREATE_EXAMPLE,
    STATE_UPDATE_EXAMPLE,
    # Response Examples
    STATE_EXAMPLE,
    INVALID_REQUEST_RESPONSE,
    STATE_NAME_EXISTS_RESPONSE,
    DELETED_RESPONSE,
    STATE_CANNOT_DELETE_RESPONSE,
    EXTERNAL_ID_EXISTS_RESPONSE,
)


class StateListCreateAPIEndpoint(BaseAPIView):
    """State List and Create Endpoint"""

    serializer_class = StateSerializer
    model = State
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [ProjectEntityPermission()]
        return [ProjectAdminPermission()]

    def get_queryset(self):
        return (
            State.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(is_triage=False)
            .filter(project__archived_at__isnull=True)
            .select_related("project")
            .select_related("workspace")
            .distinct()
        )

    @state_docs(
        operation_id="create_state",
        summary="Create state",
        description="Create a new workflow state for a project with specified name, color, and group.",
        request=OpenApiRequest(
            request=StateSerializer,
            examples=[STATE_CREATE_EXAMPLE],
        ),
        responses={
            200: OpenApiResponse(
                description="State created",
                response=StateSerializer,
                examples=[STATE_EXAMPLE],
            ),
            400: INVALID_REQUEST_RESPONSE,
            409: STATE_NAME_EXISTS_RESPONSE,
        },
    )
    def post(self, request, slug, project_id):
        """Create state

        Create a new workflow state for a project with specified name, color, and group.
        Supports external ID tracking for integration purposes.
        """
        try:
            serializer = StateSerializer(data=request.data, context={"project_id": project_id})
            if serializer.is_valid():
                if (
                    request.data.get("external_id")
                    and request.data.get("external_source")
                    and State.objects.filter(
                        project_id=project_id,
                        workspace__slug=slug,
                        external_source=request.data.get("external_source"),
                        external_id=request.data.get("external_id"),
                    ).exists()
                ):
                    state = State.objects.filter(
                        workspace__slug=slug,
                        project_id=project_id,
                        external_id=request.data.get("external_id"),
                        external_source=request.data.get("external_source"),
                    ).first()
                    return Response(
                        {
                            "error": "State with the same external id and external source already exists",
                            "id": str(state.id),
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                serializer.save(project_id=project_id)
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            state = State.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                name=request.data.get("name"),
            ).first()
            return Response(
                {
                    "error": "State with the same name already exists in the project",
                    "id": str(state.id),
                },
                status=status.HTTP_409_CONFLICT,
            )

    @state_docs(
        operation_id="list_states",
        summary="List states",
        description="Retrieve all workflow states for a project.",
        parameters=[
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                StateSerializer,
                "PaginatedStateResponse",
                "Paginated list of states",
                "Paginated States",
            ),
        },
    )
    def get(self, request, slug, project_id):
        """List states

        Retrieve all workflow states for a project.
        Returns paginated results when listing all states.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda states: StateSerializer(states, many=True, fields=self.fields, expand=self.expand).data,
        )


class StateDetailAPIEndpoint(BaseAPIView):
    """State Detail Endpoint"""

    serializer_class = StateSerializer
    model = State
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [ProjectEntityPermission()]
        return [ProjectAdminPermission()]

    def get_queryset(self):
        return (
            State.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(is_triage=False)
            .filter(project__archived_at__isnull=True)
            .select_related("project")
            .select_related("workspace")
            .distinct()
        )

    @state_docs(
        operation_id="retrieve_state",
        summary="Retrieve state",
        description="Retrieve details of a specific state.",
        parameters=[
            STATE_ID_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(
                description="State retrieved",
                response=StateSerializer,
                examples=[STATE_EXAMPLE],
            ),
        },
    )
    def get(self, request, slug, project_id, state_id):
        """Retrieve state

        Retrieve details of a specific state.
        Returns paginated results when listing all states.
        """
        serializer = StateSerializer(
            self.get_queryset().get(pk=state_id),
            fields=self.fields,
            expand=self.expand,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @state_docs(
        operation_id="delete_state",
        summary="Delete state",
        description="Permanently remove a workflow state from a project. Default states and states with existing work items cannot be deleted.",  # noqa: E501
        parameters=[
            STATE_ID_PARAMETER,
        ],
        responses={
            204: DELETED_RESPONSE,
            400: STATE_CANNOT_DELETE_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, state_id):
        """Delete state

        Permanently remove a workflow state from a project.
        Default states and states with existing work items cannot be deleted.
        """
        state = State.objects.get(is_triage=False, pk=state_id, project_id=project_id, workspace__slug=slug)

        if state.default:
            return Response(
                {"error": "Default state cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check for any issues in the state
        issue_exist = Issue.objects.filter(state=state_id).exists()

        if issue_exist:
            return Response(
                {"error": "The state is not empty, only empty states can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        state.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @state_docs(
        operation_id="update_state",
        summary="Update state",
        description="Partially update an existing workflow state's properties like name, color, or group.",
        parameters=[
            STATE_ID_PARAMETER,
        ],
        request=OpenApiRequest(
            request=StateSerializer,
            examples=[STATE_UPDATE_EXAMPLE],
        ),
        responses={
            200: OpenApiResponse(
                description="State updated",
                response=StateSerializer,
                examples=[STATE_EXAMPLE],
            ),
            400: INVALID_REQUEST_RESPONSE,
            409: EXTERNAL_ID_EXISTS_RESPONSE,
        },
    )
    def patch(self, request, slug, project_id, state_id):
        """Update state

        Partially update an existing workflow state's properties like name, color, or group.
        Validates external ID uniqueness if provided.
        """
        state = State.objects.get(workspace__slug=slug, project_id=project_id, pk=state_id)
        serializer = StateSerializer(state, data=request.data, partial=True)
        if serializer.is_valid():
            if (
                request.data.get("external_id")
                and (state.external_id != str(request.data.get("external_id")))
                and State.objects.filter(
                    project_id=project_id,
                    workspace__slug=slug,
                    external_source=request.data.get("external_source", state.external_source),
                    external_id=request.data.get("external_id"),
                ).exists()
            ):
                return Response(
                    {
                        "error": "State with the same external id and external source already exists",
                        "id": str(state.id),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class StateGroupListCreateAPIEndpoint(BaseAPIView):
    """The workspace's state groups (E30): the built-in ones and the workspace's own."""

    model = WorkspaceStateGroup
    serializer_class = WorkspaceStateGroupSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [WorkspaceEntityPermission()]
        return [WorkspaceOwnerPermission()]

    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        builtin_state_groups(workspace.id)
        groups = (
            WorkspaceStateGroup.objects.filter(workspace=workspace)
            .annotate(state_count=Count("states", filter=Q(states__deleted_at__isnull=True)))
            .order_by("sequence", "created_at")
        )
        return Response(WorkspaceStateGroupSerializer(groups, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        builtin_state_groups(workspace.id)  # the built-in names are taken first
        serializer = WorkspaceStateGroupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                serializer.save(workspace=workspace, key=None, is_builtin=False)
        except IntegrityError:
            existing = WorkspaceStateGroup.objects.filter(workspace=workspace, name=request.data.get("name")).first()
            return Response(
                {"error": "A state group with this name already exists", "id": str(existing.id) if existing else None},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StateGroupDetailAPIEndpoint(BaseAPIView):
    """One state group. A built-in group can be renamed, recoloured and reordered, never deleted or recategorised."""

    model = WorkspaceStateGroup
    serializer_class = WorkspaceStateGroupSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [WorkspaceEntityPermission()]
        return [WorkspaceOwnerPermission()]

    def _group(self, slug, pk):
        return WorkspaceStateGroup.objects.get(workspace__slug=slug, pk=pk)

    def get(self, request, slug, pk):
        return Response(WorkspaceStateGroupSerializer(self._group(slug, pk)).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, pk):
        group = self._group(slug, pk)
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
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug, pk):
        group = self._group(slug, pk)
        if group.is_builtin:
            return Response({"error": "A built-in state group cannot be deleted"}, status=status.HTTP_400_BAD_REQUEST)
        in_use = State.objects.filter(state_group=group).count()
        if in_use:
            return Response(
                {"error": f"{in_use} state(s) are in this group; move them to another group first"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
