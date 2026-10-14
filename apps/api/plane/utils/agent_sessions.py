# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent sessions: register them with a bot key, keep them alive, end them, attribute their writes.

A session proves itself with a token of its own, derived from the bot key at registration: the same bot
user, tied to the session, revoked when the session ends and capped at ``SESSION_TOKEN_DAYS``. The bot key
keeps working on its own; its calls are the bot's, with no session.
"""

import os
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from plane.db.models import AgentSession, APIToken, WorkspaceBot

SESSION_TOKEN_DAYS = 30
AWAY_AFTER = timedelta(minutes=30)
END_AFTER_AWAY = timedelta(hours=24)
# A session's last_seen_at is written at most this often by ordinary calls
TOUCH_EVERY = timedelta(seconds=60)

PROFILE_FIELDS = ("primary_dir", "host", "git_branch", "model", "harness_version")
FIELD_LIMITS = {"external_id": 255, "name": 255, "host": 255, "git_branch": 255, "model": 255, "harness_version": 64}


class SessionError(Exception):
    """A session operation that cannot be done; the message is safe to show.

    ``forbidden`` marks a caller that may not do it at all, as opposed to a request that is malformed.
    """

    def __init__(self, message, forbidden=False):
        super().__init__(message)
        self.forbidden = forbidden


def default_name(primary_dir, external_id):
    """The agent bus name: the primary dir's last part as the scope, then the first 8 of the session id."""
    base = os.path.basename((primary_dir or "").rstrip("/\\")) or "session"
    scope = re.sub(r"[^a-z0-9._-]+", "-", base.lower()).strip("-.") or "session"
    return f"{scope}@{external_id[:8]}"


def bot_for_key(token, workspace):
    """The harness bot a key may register sessions for, or a ``SessionError`` saying why not."""
    if token is None or not token.user.is_bot:
        raise SessionError("Only a bot's own key can register sessions", forbidden=True)
    if token.agent_session_id:
        raise SessionError("A session token cannot register sessions", forbidden=True)
    bot = WorkspaceBot.objects.filter(user=token.user, workspace=workspace).select_related("user").first()
    if bot is None:
        raise SessionError("This bot does not belong to the workspace", forbidden=True)
    return bot


def _clean(data):
    out = {}
    for field in ("external_id", "name", *PROFILE_FIELDS):
        value = data.get(field)
        if value is None:
            continue
        if not isinstance(value, str):
            raise SessionError(f"{field} must be a string")
        value = value.strip()
        limit = FIELD_LIMITS.get(field)
        if limit and len(value) > limit:
            raise SessionError(f"{field} is at most {limit} characters")
        out[field] = value
    harness = data.get("harness")
    if harness not in AgentSession.Harness.values:
        raise SessionError("harness must be one of " + ", ".join(AgentSession.Harness.values))
    out["harness"] = harness
    if not out.get("external_id"):
        raise SessionError("external_id is required: the harness's own session id")
    generation = data.get("generation", 0)
    if not isinstance(generation, int) or isinstance(generation, bool) or generation < 0:
        raise SessionError("generation must be a whole number of zero or more")
    out["generation"] = generation
    return out


def _issue_token(session, key):
    return APIToken.objects.create(
        user=session.bot.user,
        user_type=1,
        workspace_id=session.workspace_id,
        label=f"session {session.name}"[:255],
        description=f"Agent session {session.external_id}",
        expired_at=timezone.now() + timedelta(days=SESSION_TOKEN_DAYS),
        access=key.access,
        allowed_rate_limit=key.allowed_rate_limit,
        agent_session=session,
    )


@transaction.atomic
def register(key, workspace, data):
    """Open a session, or reopen it when the harness resumes one; returns ``(session, token, created)``.

    Reopening revokes the session's earlier tokens, so only the newest process can act as it.
    """
    bot = bot_for_key(key, workspace)
    fields = _clean(data)
    now = timezone.now()
    parent = None
    parent_id = data.get("parent_external_id")
    if parent_id:
        parent = AgentSession.objects.filter(bot=bot, external_id=str(parent_id)).first()

    session = (
        AgentSession.objects.select_for_update()
        .filter(bot=bot, harness=fields["harness"], external_id=fields["external_id"])
        .first()
    )
    created = session is None
    if created:
        session = AgentSession(
            bot=bot, workspace_id=bot.workspace_id, harness=fields["harness"], external_id=fields["external_id"]
        )
        session.started_at = now
    else:
        APIToken.objects.filter(agent_session=session, is_active=True).update(is_active=False)

    session.name = fields.get("name") or (
        session.name if not created else default_name(fields.get("primary_dir"), fields["external_id"])
    )
    for field in PROFILE_FIELDS:
        if field in fields:
            setattr(session, field, fields[field])
    session.generation = fields["generation"]
    session.parent = parent or session.parent
    session.status = AgentSession.Status.LIVE
    session.last_seen_at = now
    session.ended_at = None
    session.end_reason = ""
    session.save(created_by_id=key.user_id)
    return session, _issue_token(session, key), created


def touch(session, force=False):
    """Mark a session as seen; ordinary calls write at most once a minute."""
    now = timezone.now()
    if session.status == AgentSession.Status.ENDED:
        return
    if not force and session.status == AgentSession.Status.LIVE and now - session.last_seen_at < TOUCH_EVERY:
        return
    AgentSession.objects.filter(pk=session.pk).update(last_seen_at=now, status=AgentSession.Status.LIVE)
    session.last_seen_at = now
    session.status = AgentSession.Status.LIVE


@transaction.atomic
def end(session, reason="ended"):
    """End a session for good: its tokens stop working at once."""
    if session.status == AgentSession.Status.ENDED:
        return session
    session.status = AgentSession.Status.ENDED
    session.ended_at = timezone.now()
    session.end_reason = (reason or "ended")[:64]
    session.save(update_fields=["status", "ended_at", "end_reason", "updated_at"])
    APIToken.objects.filter(agent_session=session, is_active=True).update(is_active=False)
    return session


def sweep(now=None):
    """Live sessions not seen for ``AWAY_AFTER`` go away; away ones not seen for ``END_AFTER_AWAY`` more end."""
    now = now or timezone.now()
    away = AgentSession.objects.filter(status=AgentSession.Status.LIVE, last_seen_at__lt=now - AWAY_AFTER).update(
        status=AgentSession.Status.AWAY
    )
    ended = 0
    for session in AgentSession.objects.filter(
        status=AgentSession.Status.AWAY, last_seen_at__lt=now - AWAY_AFTER - END_AFTER_AWAY
    ):
        end(session, reason="silent")
        ended += 1
    return away, ended
