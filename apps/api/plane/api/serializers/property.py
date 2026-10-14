# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import PropertyType, WorkItemProperty, WorkItemPropertyOption


class WorkItemPropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = WorkItemPropertyOption
        fields = [
            "id",
            "property",
            "name",
            "description",
            "color",
            "is_default",
            "sequence",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "property", "created_at", "updated_at"]


class WorkItemPropertySerializer(BaseSerializer):
    """A custom work item property (D39). Its type cannot change once work items carry values for it."""

    options = WorkItemPropertyOptionSerializer(many=True, read_only=True)

    class Meta:
        model = WorkItemProperty
        fields = [
            "id",
            "display_name",
            "name",
            "description",
            "property_type",
            "relation_type",
            "is_multi",
            "is_required",
            "is_active",
            "default_value",
            "display_format",
            "sequence",
            "external_source",
            "external_id",
            "options",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "name", "options", "created_at", "updated_at"]

    def validate(self, data):
        kind = data.get("property_type", getattr(self.instance, "property_type", None))
        relation = data.get("relation_type", getattr(self.instance, "relation_type", None))
        if kind == PropertyType.RELATION and not relation:
            raise serializers.ValidationError({"relation_type": "A relation property needs USER or ISSUE"})
        if kind != PropertyType.RELATION and relation:
            data["relation_type"] = None
        if (
            self.instance is not None
            and "property_type" in data
            and data["property_type"] != self.instance.property_type
            and self.instance.values.exists()
        ):
            raise serializers.ValidationError({"property_type": "Work items carry values for it, so its type stays"})
        return data
