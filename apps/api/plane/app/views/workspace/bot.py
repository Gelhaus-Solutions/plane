# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace settings: bot accounts, their projects and their API tokens."""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import BotTokenSecretSerializer, BotTokenSerializer, WorkspaceBotSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import APIToken, BotTypeEnum, Project, Workspace, WorkspaceBot, WorkspaceMember
from plane.utils import bots
from plane.utils.bots import BotError

# Bots people manage here; the system bot belongs to Plane
MANAGED_BOT_TYPES = (BotTypeEnum.USER, BotTypeEnum.APP)


def _bad_request(message):
    return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


def _role(value, default=15):
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return -1


class _BotMixin:
    def get_bot(self, slug, pk):
        return WorkspaceBot.objects.select_related("user", "workspace").get(
            pk=pk, workspace__slug=slug, user__bot_type__in=MANAGED_BOT_TYPES
        )


class WorkspaceBotEndpoint(_BotMixin, BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk is not None:
            return Response(WorkspaceBotSerializer(self.get_bot(slug, pk)).data, status=status.HTTP_200_OK)
        workspace_bots = WorkspaceBot.objects.filter(
            workspace__slug=slug, user__bot_type__in=MANAGED_BOT_TYPES
        ).select_related("user")
        return Response(WorkspaceBotSerializer(workspace_bots, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        projects = request.data.get("projects") or []
        if not isinstance(projects, list):
            return _bad_request("projects must be a list of {project_id, role}")
        try:
            with transaction.atomic():
                bot = bots.create_bot(
                    workspace,
                    request.data.get("name"),
                    created_by=request.user,
                    description=request.data.get("description", ""),
                    role=_role(request.data.get("role")),
                )
                for entry in projects:
                    project = Project.objects.get(pk=entry.get("project_id"), workspace=workspace)
                    bots.add_to_project(bot, project, _role(entry.get("role")))
        except BotError as error:
            return _bad_request(str(error))
        except (Project.DoesNotExist, AttributeError, ValueError):
            return _bad_request("Each project needs a project_id from this workspace")
        return Response(WorkspaceBotSerializer(bot).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        bot = self.get_bot(slug, pk)
        user = bot.user
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if not name or len(name) > 255:
                return _bad_request("A bot needs a name of at most 255 characters")
            user.display_name = name
            user.first_name = name
            user.save(update_fields=["display_name", "first_name"])
        if "description" in request.data:
            bot.description = request.data.get("description") or ""
            bot.save(update_fields=["description", "updated_at"])
        if "role" in request.data:
            role = _role(request.data.get("role"))
            if role not in bots.ROLES:
                return _bad_request("role must be 5 (guest), 15 (member) or 20 (admin)")
            WorkspaceMember.objects.filter(workspace_id=bot.workspace_id, member=user).update(role=role)
        if "is_active" in request.data:
            bots.set_active(bot, bool(request.data.get("is_active")))
        bot.refresh_from_db()
        return Response(WorkspaceBotSerializer(bot).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        bots.delete_bot(self.get_bot(slug, pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceBotProjectEndpoint(_BotMixin, BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        bot = self.get_bot(slug, pk)
        try:
            project = Project.objects.get(pk=request.data.get("project_id"), workspace_id=bot.workspace_id)
            bots.add_to_project(bot, project, _role(request.data.get("role")))
        except BotError as error:
            return _bad_request(str(error))
        except (Project.DoesNotExist, ValueError):
            return _bad_request("project_id must be a project in this workspace")
        return Response(WorkspaceBotSerializer(bot).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk, project_id):
        bot = self.get_bot(slug, pk)
        project = Project.objects.get(pk=project_id, workspace_id=bot.workspace_id)
        bots.remove_from_project(bot, project)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceBotTokenEndpoint(_BotMixin, BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk):
        bot = self.get_bot(slug, pk)
        tokens = APIToken.objects.filter(user=bot.user, is_active=True)
        return Response(BotTokenSerializer(tokens, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        bot = self.get_bot(slug, pk)
        serializer = BotTokenSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = bots.issue_token(bot, **serializer.validated_data)
        except BotError as error:
            return _bad_request(str(error))
        # The secret is shown once, here
        return Response(BotTokenSecretSerializer(token).data, status=status.HTTP_201_CREATED)


class WorkspaceBotTokenDetailEndpoint(_BotMixin, BaseAPIView):
    def get_token(self, slug, pk, token_id):
        bot = self.get_bot(slug, pk)
        return APIToken.objects.get(pk=token_id, user=bot.user, is_active=True)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk, token_id):
        """Rotate: a new secret with the same settings; the old one stops working."""
        replacement = bots.rotate_token(self.get_token(slug, pk, token_id))
        return Response(BotTokenSecretSerializer(replacement).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk, token_id):
        token = self.get_token(slug, pk, token_id)
        token.is_active = False
        token.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
