# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Bot accounts: create them, add them to projects, switch them off, and give them tokens.

A bot is a ``User`` with ``is_bot`` set plus a ``WorkspaceBot`` row. Its address is under
``.invalid`` (RFC 2606), so no mail can ever reach it, and it has no usable password; the
sign-in flows refuse bots outright. It acts only through API tokens.
"""

import uuid

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    APIToken,
    BotTypeEnum,
    ProjectMember,
    ProjectUserProperty,
    User,
    WorkspaceBot,
    WorkspaceMember,
)

ROLES = (5, 15, 20)
TOKEN_ACCESS = ("read", "write")
SYSTEM_BOT_NAME = "Plane"


class BotError(Exception):
    """A bot operation that cannot be done; the message is safe to show."""


def _bot_user(workspace, name, bot_type):
    handle = uuid.uuid4().hex
    user = User(
        username=f"bot_{handle}",
        email=f"bot-{handle}@{workspace.slug}.bots.invalid",
        display_name=name,
        first_name=name,
        last_name="",
        is_bot=True,
        bot_type=bot_type,
        is_password_autoset=True,
        is_email_valid=False,
    )
    user.set_unusable_password()
    user.save()
    return user


@transaction.atomic
def create_bot(workspace, name, created_by=None, description="", role=15, bot_type=BotTypeEnum.USER):
    name = (name or "").strip()
    if not name:
        raise BotError("A bot needs a name")
    if len(name) > 255:
        raise BotError("A bot name is at most 255 characters")
    if role not in ROLES:
        raise BotError("role must be 5 (guest), 15 (member) or 20 (admin)")

    user = _bot_user(workspace, name, bot_type)
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, company_role="")
    bot = WorkspaceBot(user=user, workspace=workspace, description=description or "")
    bot.save(created_by_id=getattr(created_by, "id", None))
    return bot


def system_bot(workspace):
    """The workspace's own actor for automations, recurring items and mail intake; made on first use."""
    existing = WorkspaceBot.objects.filter(
        workspace=workspace, user__bot_type=BotTypeEnum.SYSTEM, user__is_active=True
    ).first()
    if existing:
        return existing
    return create_bot(workspace, SYSTEM_BOT_NAME, role=20, bot_type=BotTypeEnum.SYSTEM)


def add_to_project(bot, project, role=15):
    """Make the bot a project member, so it can be assigned and mentioned there."""
    if project.workspace_id != bot.workspace_id:
        raise BotError("The project is in another workspace")
    if role not in ROLES:
        raise BotError("role must be 5 (guest), 15 (member) or 20 (admin)")
    workspace_role = (
        WorkspaceMember.objects.filter(workspace_id=bot.workspace_id, member=bot.user)
        .values_list("role", flat=True)
        .first()
    )
    if workspace_role is not None and role > workspace_role:
        raise BotError("A bot's project role cannot be higher than its workspace role")

    member, created = ProjectMember.objects.get_or_create(
        project=project,
        member=bot.user,
        defaults={"role": role, "workspace_id": bot.workspace_id},
    )
    if not created:
        member.role = role
        member.is_active = True
        member.save(update_fields=["role", "is_active"])
    ProjectUserProperty.objects.get_or_create(
        project=project, user=bot.user, defaults={"workspace_id": bot.workspace_id, "sort_order": 65535}
    )
    return member


def remove_from_project(bot, project):
    ProjectMember.objects.filter(project=project, member=bot.user).update(is_active=False)


def set_active(bot, active):
    """Switch a bot off or on. Off: its tokens stop working and it leaves the member lists."""
    user = bot.user
    user.is_active = active
    if not active:
        user.last_logout_time = timezone.now()
    user.save(update_fields=["is_active", "last_logout_time"])
    WorkspaceMember.objects.filter(workspace_id=bot.workspace_id, member=user).update(is_active=active)


@transaction.atomic
def delete_bot(bot):
    """Remove a bot for good. The user row stays, so its activity keeps its author."""
    set_active(bot, False)
    APIToken.objects.filter(user=bot.user).update(is_active=False)
    ProjectMember.objects.filter(member=bot.user).update(is_active=False)
    bot.delete()


def issue_token(bot, label="", description="", expired_at=None, access="write", allowed_rate_limit=None):
    """A new API token acting as the bot. Its secret is only readable on the returned object."""
    if access not in TOKEN_ACCESS:
        raise BotError("access must be read or write")
    return APIToken.objects.create(
        user=bot.user,
        user_type=1,
        workspace_id=bot.workspace_id,
        label=label or uuid.uuid4().hex,
        description=description or "",
        expired_at=expired_at,
        access=access,
        allowed_rate_limit=allowed_rate_limit or settings.API_KEY_RATE_LIMIT,
    )


@transaction.atomic
def rotate_token(token):
    """Replace a token with a new secret and the same settings; the old one stops working at once."""
    replacement = APIToken.objects.create(
        user=token.user,
        user_type=token.user_type,
        workspace_id=token.workspace_id,
        label=token.label,
        description=token.description,
        expired_at=token.expired_at,
        access=token.access,
        allowed_rate_limit=token.allowed_rate_limit,
    )
    token.is_active = False
    token.save(update_fields=["is_active"])
    return replacement
