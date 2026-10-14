# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""God mode: every bot on the instance, and switching any of them off."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models import APIToken, WorkspaceBot
from plane.license.api.permissions import InstanceAdminPermission
from plane.utils import bots


def _bot_row(bot):
    return {
        "id": str(bot.id),
        "user_id": str(bot.user_id),
        "name": bot.user.display_name,
        "bot_type": bot.user.bot_type,
        "description": bot.description,
        "is_active": bot.user.is_active,
        "workspace": {"id": str(bot.workspace_id), "slug": bot.workspace.slug, "name": bot.workspace.name},
        "created_by": bot.created_by.email if bot.created_by_id else None,
        "token_count": APIToken.objects.filter(user_id=bot.user_id, is_active=True).count(),
        "created_at": bot.created_at,
    }


class InstanceBotEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def get(self, request):
        instance_bots = WorkspaceBot.objects.select_related("user", "workspace", "created_by").order_by(
            "workspace__slug", "user__display_name"
        )
        return Response([_bot_row(bot) for bot in instance_bots], status=status.HTTP_200_OK)

    def patch(self, request, pk):
        bot = WorkspaceBot.objects.select_related("user", "workspace", "created_by").get(pk=pk)
        if "is_active" not in request.data:
            return Response({"error": "Send is_active"}, status=status.HTTP_400_BAD_REQUEST)
        bots.set_active(bot, bool(request.data.get("is_active")))
        bot.refresh_from_db()
        return Response(_bot_row(bot), status=status.HTTP_200_OK)
