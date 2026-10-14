# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import WorkspacePriority


class WorkspacePrioritySerializer(BaseSerializer):
    """A workspace priority (E35). Built-in priorities keep their key and level."""

    issue_count = serializers.SerializerMethodField()

    def get_issue_count(self, obj):
        return getattr(obj, "issue_count", None)

    class Meta:
        model = WorkspacePriority
        fields = [
            "id",
            "name",
            "key",
            "level",
            "color",
            "icon",
            "description",
            "sequence",
            "is_builtin",
            "issue_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "key", "is_builtin", "issue_count", "created_at", "updated_at"]
