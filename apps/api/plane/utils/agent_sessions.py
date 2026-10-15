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

from django.db import IntegrityError, transaction
from django.utils import timezone

from plane.db.models import AgentInboxMessage, AgentSession, APIToken, IssueAssignee, WorkItemClaim, WorkspaceBot
from plane.utils import agent_inbox

SESSION_TOKEN_DAYS = 30
AWAY_AFTER = timedelta(minutes=30)
END_AFTER_AWAY = timedelta(hours=2)
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
    hand_over_to(session)
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
    _end_claims(WorkItemClaim.objects.filter(session=session), WorkItemClaim.EndReason.SESSION_ENDED)
    return session


def sweep(now=None):
    """Live sessions not seen for ``AWAY_AFTER`` go away; away ones not seen for ``END_AFTER_AWAY`` more end."""
    now = now or timezone.now()
    going = AgentSession.objects.filter(status=AgentSession.Status.LIVE, last_seen_at__lt=now - AWAY_AFTER)
    going_ids = list(going.values_list("id", flat=True))
    away = AgentSession.objects.filter(pk__in=going_ids).update(status=AgentSession.Status.AWAY)
    # A claim lapses when its session goes away (D23)
    _end_claims(WorkItemClaim.objects.filter(session_id__in=going_ids), WorkItemClaim.EndReason.SESSION_AWAY)
    ended = 0
    for session in AgentSession.objects.filter(
        status=AgentSession.Status.AWAY, last_seen_at__lt=now - AWAY_AFTER - END_AFTER_AWAY
    ):
        end(session, reason="silent")
        ended += 1
    return away, ended


# ------------------------------------------------------------------ handover (D20)


def hand_over_to(session):
    """Open items assigned to an ended session of the same bot and primary dir move to this session, which is told.

    Runs when a session registers: the item shows "waiting for a session" until the next session of that repository
    starts. Returns the rows that moved.
    """
    if not session.primary_dir:
        return []
    rows = list(
        IssueAssignee.objects.filter(
            agent_session__bot_id=session.bot_id,
            agent_session__primary_dir=session.primary_dir,
            agent_session__status=AgentSession.Status.ENDED,
            issue__deleted_at__isnull=True,
            issue__archived_at__isnull=True,
        )
        .exclude(agent_session_id=session.id)
        .exclude(issue__state__group__in=("completed", "cancelled"))
        .select_related("issue__project", "agent_session")
        .order_by("created_at")
    )
    if not rows:
        return []
    earlier = sorted({row.agent_session.name for row in rows})
    IssueAssignee.objects.filter(pk__in=[row.pk for row in rows]).update(agent_session=session)
    items = [
        {
            "identifier": f"{row.issue.project.identifier}-{row.issue.sequence_id}",
            "name": row.issue.name,
            "issue_id": str(row.issue_id),
            "project_id": str(row.issue.project_id),
            "delegated": row.delegated,
            "from_session": row.agent_session.name,
        }
        for row in rows
    ]
    listing = "\n".join(f"- {item['identifier']}: {item['name']}" for item in items)
    agent_inbox.deliver(
        workspace_id=session.workspace_id,
        bot=session.bot,
        session=session,
        kind=AgentInboxMessage.Kind.HANDOVER,
        dedupe_key=f"handover:{session.id}:{max(row.updated_at for row in rows).timestamp()}:{len(rows)}",
        body=f"{len(rows)} work item(s) handed over from {', '.join(earlier)}:\n{listing}",
        data={"items": items, "from_sessions": earlier},
    )
    return rows


# ------------------------------------------------------------------ claims


class ClaimConflict(SessionError):
    """Another live session holds the claim."""

    def __init__(self, claim):
        super().__init__(f"Claimed by {claim_label(claim)} since {claim.claimed_at:%Y-%m-%d %H:%M} UTC")
        self.claim = claim


def claim_label(claim):
    return f"{claim.session.bot.user.display_name} \u00b7 {claim.session.name}"


def _end_claims(claims, reason, now=None):
    return claims.filter(ended_at__isnull=True).update(ended_at=now or timezone.now(), end_reason=reason)


def open_claim(issue):
    return WorkItemClaim.objects.filter(issue=issue, ended_at__isnull=True).select_related("session__bot__user").first()


def claim(issue, session):
    """Claim the work item for the session; returns ``(claim, created)``. A claim held by a session that is no
    longer live is taken over; one held by a live session is refused with ``ClaimConflict``."""
    if session.status == AgentSession.Status.ENDED:
        raise SessionError("This agent session has ended", forbidden=True)
    try:
        with transaction.atomic():
            current = (
                WorkItemClaim.objects.select_for_update()
                .filter(issue=issue, ended_at__isnull=True)
                .select_related("session__bot__user")
                .first()
            )
            if current is not None:
                if current.session_id == session.id:
                    return current, False
                if current.session.status == AgentSession.Status.LIVE:
                    raise ClaimConflict(current)
                _end_claims(WorkItemClaim.objects.filter(pk=current.pk), WorkItemClaim.EndReason.LAPSED)
            made = WorkItemClaim.objects.create(
                workspace_id=issue.workspace_id, issue=issue, session=session, claimed_at=timezone.now()
            )
            return WorkItemClaim.objects.select_related("session__bot__user").get(pk=made.pk), True
    except IntegrityError:
        # Another session claimed it in the same moment
        current = open_claim(issue)
        if current is not None and current.session_id != session.id:
            raise ClaimConflict(current)
        raise


def release(issue, session=None):
    """End the open claim: the holding session releases its own, a person (no session) releases any."""
    current = open_claim(issue)
    if current is None:
        return None
    if session is not None and current.session_id != session.id:
        raise SessionError(f"Claimed by {claim_label(current)}, not by this session", forbidden=True)
    reason = WorkItemClaim.EndReason.RELEASED if session is not None else WorkItemClaim.EndReason.RELEASED_BY_PERSON
    _end_claims(WorkItemClaim.objects.filter(pk=current.pk), reason)
    current.refresh_from_db()
    return current


# Payloads shared by the public API and the app
def session_data(session):
    bot_user = session.bot.user
    return {
        "id": str(session.id),
        "bot": {"id": str(session.bot_id), "user_id": str(bot_user.id), "display_name": bot_user.display_name},
        "harness": session.harness,
        "external_id": session.external_id,
        "generation": session.generation,
        "name": session.name,
        "primary_dir": session.primary_dir,
        "host": session.host,
        "git_branch": session.git_branch,
        "model": session.model,
        "harness_version": session.harness_version,
        "parent": str(session.parent_id) if session.parent_id else None,
        "status": session.status,
        "started_at": session.started_at,
        "last_seen_at": session.last_seen_at,
        "ended_at": session.ended_at,
        "end_reason": session.end_reason,
    }


def session_lite(session):
    """The session behind a comment or an activity, for its chip: enough to name it and show where it stands."""
    if session is None:
        return None
    bot_user = session.bot.user
    return {
        "id": str(session.id),
        "name": session.name,
        "status": session.status,
        "harness": session.harness,
        "bot": {"id": str(bot_user.id), "display_name": bot_user.display_name},
    }


def sessions_in(slug):
    return AgentSession.objects.filter(workspace__slug=slug).select_related("bot__user")
