# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Custom work item properties (D39): the workspace's properties and options, and their values on work items."""

from django.db import IntegrityError, transaction
from django.template.defaultfilters import slugify
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from plane.api.serializers import WorkItemPropertyOptionSerializer, WorkItemPropertySerializer
from plane.app.permissions import ProjectEntityPermission, WorkspaceEntityPermission, WorkspaceOwnerPermission
from plane.db.models import Issue, Workspace, WorkItemProperty, WorkItemPropertyOption, WorkItemPropertyValue
from plane.utils.properties import PropertyValueError, read_value, read_values, set_values

from .base import BaseAPIView


class _AdminWrites:
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [WorkspaceEntityPermission()]
        return [WorkspaceOwnerPermission()]


def _conflict(message):
    return Response({"error": message}, status=status.HTTP_409_CONFLICT)


class PropertyListCreateAPIEndpoint(_AdminWrites, BaseAPIView):
    model = WorkItemProperty
    serializer_class = WorkItemPropertySerializer

    def get(self, request, slug):
        properties = WorkItemProperty.objects.filter(workspace__slug=slug).prefetch_related("options")
        return Response(WorkItemPropertySerializer(properties, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkItemPropertySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        options = request.data.get("options") or []
        if not isinstance(options, list) or not all(isinstance(o, dict) and o.get("name") for o in options):
            return Response({"options": "A list of {name, color, description, is_default}"}, status=400)
        try:
            with transaction.atomic():
                prop = serializer.save(workspace=workspace, name=slugify(serializer.validated_data["display_name"]))
                for sequence, option in enumerate(options):
                    WorkItemPropertyOption.objects.create(
                        property=prop,
                        name=option["name"],
                        color=option.get("color") or "",
                        description=option.get("description") or "",
                        is_default=bool(option.get("is_default")),
                        sequence=(sequence + 1) * 10000,
                    )
        except IntegrityError:
            return _conflict("A property with this name, or an option with the same name twice, already exists")
        return Response(WorkItemPropertySerializer(prop).data, status=status.HTTP_201_CREATED)


class PropertyDetailAPIEndpoint(_AdminWrites, BaseAPIView):
    model = WorkItemProperty
    serializer_class = WorkItemPropertySerializer

    def _property(self, slug, pk):
        return WorkItemProperty.objects.get(workspace__slug=slug, pk=pk)

    def get(self, request, slug, pk):
        return Response(WorkItemPropertySerializer(self._property(slug, pk)).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, pk):
        prop = self._property(slug, pk)
        serializer = WorkItemPropertySerializer(prop, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        extra = (
            {"name": slugify(serializer.validated_data["display_name"])}
            if "display_name" in serializer.validated_data
            else {}
        )
        try:
            with transaction.atomic():
                prop = serializer.save(**extra)
        except IntegrityError:
            return _conflict("A property with this name already exists")
        return Response(WorkItemPropertySerializer(prop).data, status=status.HTTP_200_OK)

    def delete(self, request, slug, pk):
        prop = self._property(slug, pk)
        with transaction.atomic():
            WorkItemPropertyValue.objects.filter(property=prop).delete()
            prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PropertyOptionListCreateAPIEndpoint(_AdminWrites, BaseAPIView):
    model = WorkItemPropertyOption
    serializer_class = WorkItemPropertyOptionSerializer

    def get(self, request, slug, property_id):
        options = WorkItemPropertyOption.objects.filter(property_id=property_id, property__workspace__slug=slug)
        return Response(WorkItemPropertyOptionSerializer(options, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, property_id):
        prop = WorkItemProperty.objects.get(workspace__slug=slug, pk=property_id)
        serializer = WorkItemPropertyOptionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                serializer.save(property=prop)
        except IntegrityError:
            return _conflict("The property already has an option with this name")
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PropertyOptionDetailAPIEndpoint(_AdminWrites, BaseAPIView):
    model = WorkItemPropertyOption
    serializer_class = WorkItemPropertyOptionSerializer

    def _option(self, slug, property_id, pk):
        return WorkItemPropertyOption.objects.get(property_id=property_id, property__workspace__slug=slug, pk=pk)

    def get(self, request, slug, property_id, pk):
        return Response(WorkItemPropertyOptionSerializer(self._option(slug, property_id, pk)).data)

    def patch(self, request, slug, property_id, pk):
        serializer = WorkItemPropertyOptionSerializer(
            self._option(slug, property_id, pk), data=request.data, partial=True
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return _conflict("The property already has an option with this name")
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug, property_id, pk):
        option = self._option(slug, property_id, pk)
        with transaction.atomic():
            WorkItemPropertyValue.objects.filter(value_option=option).delete()
            option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkItemPropertyValuesAPIEndpoint(BaseAPIView):
    """Every custom property of the workspace with its value on one work item."""

    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)
        return Response(read_values(issue), status=status.HTTP_200_OK)


class WorkItemPropertyValueAPIEndpoint(BaseAPIView):
    """One property's value on one work item: read, replace (PUT {"value": ...}), clear."""

    permission_classes = [ProjectEntityPermission]

    def _both(self, slug, project_id, issue_id, property_id):
        issue = Issue.issue_objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)
        return issue, WorkItemProperty.objects.get(workspace_id=issue.workspace_id, pk=property_id)

    def _shown(self, prop, value):
        return {"property_id": str(prop.id), "name": prop.display_name, "type": prop.property_type, "value": value}

    def get(self, request, slug, project_id, issue_id, property_id):
        issue, prop = self._both(slug, project_id, issue_id, property_id)
        value = read_value(prop, WorkItemPropertyValue.objects.filter(issue=issue, property=prop))
        return Response(self._shown(prop, value), status=status.HTTP_200_OK)

    def put(self, request, slug, project_id, issue_id, property_id):
        issue, prop = self._both(slug, project_id, issue_id, property_id)
        if "value" not in request.data:
            return Response({"error": "Pass value"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            value = set_values(issue, prop, request.data["value"])
        except PropertyValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._shown(prop, value), status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, issue_id, property_id):
        issue, prop = self._both(slug, project_id, issue_id, property_id)
        WorkItemPropertyValue.objects.filter(issue=issue, property=prop).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
