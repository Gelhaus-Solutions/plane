# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import Project, State, StateGroup


class StateSerializer(BaseSerializer):
    order = serializers.FloatField(required=False)

    class Meta:
        model = State
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "color",
            "group",
            "default",
            "description",
            "sequence",
            "order",
            "state_group",
        ]
        # Defaults only change through mark_as_default, which also clears the old one
        read_only_fields = ["workspace", "project", "default"]

    def validate(self, attrs):
        if attrs.get("group") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        # A state sits in one of its workspace's state groups (E30) and takes the group's category
        group = attrs.get("state_group")
        project_id = self.context.get("project_id") or (self.instance.project_id if self.instance else None)
        if group is not None and not Project.objects.filter(pk=project_id, workspace_id=group.workspace_id).exists():
            raise serializers.ValidationError({"state_group": "Pick a state group of this workspace"})
        return attrs


class StateLiteSerializer(BaseSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
