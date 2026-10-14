# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction

# Module imports
from .base import BaseSerializer
from plane.db.models import Project, State, StateGroup, WorkspaceStateGroup
from rest_framework import serializers


class StateSerializer(BaseSerializer):
    """
    Serializer for work item states with default state management.

    Handles state creation and updates including default state validation
    and automatic default state switching for workflow management.
    """

    def validate(self, data):
        if data.get("group", None) == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        return data

    def validate_state_group(self, value):
        """A state group of the state's own workspace; setting it also sets ``group`` to its category."""
        if value is None:
            return value
        if self.instance is not None:
            workspace_id = self.instance.workspace_id
        else:
            workspace_id = (
                Project.objects.filter(pk=self.context.get("project_id")).values_list("workspace_id", flat=True).first()
            )
        if value.workspace_id != workspace_id:
            raise serializers.ValidationError("That state group belongs to another workspace")
        return value

    def save(self, **kwargs):
        # Clear the old default only once the new one is saved, so a failed save keeps it
        with transaction.atomic():
            state = super().save(**kwargs)
            if self.validated_data.get("default"):
                State.objects.filter(project_id=state.project_id).exclude(pk=state.pk).update(default=False)
        return state

    class Meta:
        model = State
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "deleted_at",
            "slug",
        ]


class StateLiteSerializer(BaseSerializer):
    """
    Lightweight state serializer for minimal data transfer.

    Provides essential state information including visual properties
    and grouping data optimized for UI display and filtering.
    """

    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields


class WorkspaceStateGroupSerializer(BaseSerializer):
    """A workspace state group (E30). Built-in groups keep their key and category."""

    state_count = serializers.SerializerMethodField()

    def get_state_count(self, obj):
        return getattr(obj, "state_count", None)

    class Meta:
        model = WorkspaceStateGroup
        fields = [
            "id",
            "name",
            "key",
            "category",
            "color",
            "description",
            "sequence",
            "is_builtin",
            "state_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "key", "is_builtin", "state_count", "created_at", "updated_at"]
