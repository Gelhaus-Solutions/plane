# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re

from rest_framework import serializers

from plane.db.models import APIToken, ProjectMember, WorkspaceBot, WorkspaceMember

from .base import BaseSerializer
from .user import UserLiteSerializer

RATE_LIMIT = re.compile(r"^\d{1,6}/(s|sec|second|m|min|minute|h|hour|d|day)$")


class WorkspaceBotSerializer(BaseSerializer):
    user = UserLiteSerializer(read_only=True)
    name = serializers.CharField(source="user.display_name", read_only=True)
    bot_type = serializers.CharField(source="user.bot_type", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    role = serializers.SerializerMethodField()
    projects = serializers.SerializerMethodField()
    token_count = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceBot
        fields = [
            "id",
            "user",
            "name",
            "bot_type",
            "description",
            "is_active",
            "role",
            "projects",
            "token_count",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_role(self, bot):
        return (
            WorkspaceMember.objects.filter(workspace_id=bot.workspace_id, member_id=bot.user_id)
            .values_list("role", flat=True)
            .first()
        )

    def get_projects(self, bot):
        return [
            {"project_id": str(project_id), "name": name, "identifier": identifier, "role": role}
            for project_id, name, identifier, role in ProjectMember.objects.filter(
                member_id=bot.user_id, workspace_id=bot.workspace_id, is_active=True
            ).values_list("project_id", "project__name", "project__identifier", "role")
        ]

    def get_token_count(self, bot):
        return APIToken.objects.filter(user_id=bot.user_id, is_active=True).count()


class BotTokenSerializer(BaseSerializer):
    """A bot's API token. The secret is only sent back when the token is created or rotated."""

    class Meta:
        model = APIToken
        fields = [
            "id",
            "label",
            "description",
            "access",
            "allowed_rate_limit",
            "expired_at",
            "last_used",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "last_used", "is_active", "created_at"]

    def validate_allowed_rate_limit(self, value):
        if value and not RATE_LIMIT.match(value):
            raise serializers.ValidationError('Use requests per period, as in "120/min" or "5000/hour"')
        return value


class BotTokenSecretSerializer(BotTokenSerializer):
    class Meta(BotTokenSerializer.Meta):
        fields = BotTokenSerializer.Meta.fields + ["token"]
        read_only_fields = BotTokenSerializer.Meta.read_only_fields + ["token"]
