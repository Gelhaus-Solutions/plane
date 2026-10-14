# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agents on work items (E28, D17, D21, D26): a bot assignee's row can name a session, a bot can work for a human
assignee who stays accountable, and a bot with no session is a queue any of its sessions may take from by claiming.
"""

from crum import get_current_user
from django.db import IntegrityError, transaction
from django.db.models import Q

from plane.db.models import (
    AgentSession,
    IssueAssignee,
    ProjectMember,
    WorkItemClaim,
    WorkspaceBot,
)
from plane.utils import agent_inbox
from plane.utils.agent_sessions import SessionError

CLOSED_GROUPS = ("completed", "cancelled")


def find_bot(workspace_id, ref):
    """The harness bot a request names, by its id or its user's id."""
    bots = WorkspaceBot.objects.select_related("user").filter(workspace_id=workspace_id, user__is_active=True)
    try:
        return bots.filter(Q(pk=ref) | Q(user_id=ref)).first()
    except (ValueError, TypeError):
        return None


@transaction.atomic
def assign(issue, bot, session=None, delegate=False, actor=None, author=None):
    """Assign the item to a bot's queue, or to one of its sessions; with ``delegate`` the bot works for the item's
    human assignee instead. Returns ``(row, changed)``; naming the same thing again changes nothing."""
    if bot.workspace_id != issue.workspace_id:
        raise SessionError("This bot does not belong to the work item's workspace")
    if not ProjectMember.objects.filter(project_id=issue.project_id, member_id=bot.user_id, is_active=True).exists():
        raise SessionError(f"{bot.user.display_name} is not a member of this project")
    if session is not None:
        if session.bot_id != bot.id:
            raise SessionError(f"{session.name} is not a session of {bot.user.display_name}")
        if session.status == AgentSession.Status.ENDED:
            raise SessionError(f"{session.name} has ended")

    row = IssueAssignee.objects.filter(issue=issue, assignee_id=bot.user_id).first()
    changed = row is None or row.agent_session_id != (session.id if session else None) or row.delegated != delegate
    if row is None:
        row = IssueAssignee(
            issue=issue, project_id=issue.project_id, workspace_id=issue.workspace_id, assignee_id=bot.user_id
        )
    if changed:
        row.agent_session = session
        row.delegated = bool(delegate)
        row.save()
        agent_inbox.on_assignment(row, bot, issue, actor=actor, author=author)
    return row, changed


def tell_new_bot_assignees(issue, rows, actor=None):
    """Bots that a plain assignee change put on an item (the web's pickers, bulk edits) hear it in their queue, as
    if assigned through the agents path (D46)."""
    rows = [row for row in rows if row.agent_session_id is None]
    if not rows:
        return
    bots = {
        bot.user_id: bot
        for bot in WorkspaceBot.objects.select_related("user").filter(
            workspace_id=issue.workspace_id, user_id__in=[row.assignee_id for row in rows], user__is_active=True
        )
    }
    if not bots:
        return
    if actor is None:
        current = get_current_user()
        actor = current if getattr(current, "is_authenticated", False) else None
    for row in rows:
        bot = bots.get(row.assignee_id)
        if bot is not None:
            agent_inbox.on_assignment(row, bot, issue, actor=actor)


def set_assignees(issue, assignee_ids, actor=None):
    """Makes the item's assignees exactly ``assignee_ids``. Rows that stay keep what they name (a session, a
    delegation), so a person editing the assignees never turns a session's item back into a queue item; bots that
    are new on the item are told."""
    wanted = {str(assignee_id) for assignee_id in assignee_ids}
    existing = {str(row.assignee_id) for row in IssueAssignee.objects.filter(issue=issue)}
    removed = existing - wanted
    if removed:
        IssueAssignee.objects.filter(issue=issue, assignee_id__in=removed).delete()
    added = [assignee_id for assignee_id in assignee_ids if str(assignee_id) not in existing]
    if not added:
        return
    try:
        IssueAssignee.objects.bulk_create(
            [
                IssueAssignee(
                    assignee_id=assignee_id,
                    issue=issue,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                    created_by_id=issue.created_by_id,
                    updated_by_id=issue.updated_by_id,
                )
                for assignee_id in added
            ],
            batch_size=10,
            ignore_conflicts=True,
        )
    except IntegrityError:
        return
    tell_new_bot_assignees(
        issue, list(IssueAssignee.objects.filter(issue=issue, assignee_id__in=added, assignee__is_bot=True)), actor
    )


def unassign(issue, bot):
    """Take the bot (and its session or delegation) off the item; returns whether it was on it."""
    return bool(IssueAssignee.objects.filter(issue=issue, assignee_id=bot.user_id).delete())


def rows_for(issue):
    """The agent rows on an item, each with where it stands: in the bot's queue, with a session, or waiting for one
    because the session it named has ended (D20)."""
    rows = IssueAssignee.objects.filter(issue=issue, assignee__is_bot=True).select_related("assignee", "agent_session")
    out = []
    for row in rows:
        session = row.agent_session
        if session is None:
            state = "queue"
        else:
            state = "waiting" if session.status == AgentSession.Status.ENDED else "session"
        out.append((row, state))
    return out


def work_for(session):
    """``(named, queue)``: the open items assigned to this session, and the open, unclaimed ones in its bot's queue."""
    rows = IssueAssignee.objects.filter(
        assignee_id=session.bot.user_id,
        issue__deleted_at__isnull=True,
        issue__archived_at__isnull=True,
        issue__is_draft=False,
    ).exclude(issue__state__group__in=CLOSED_GROUPS)
    rows = rows.select_related("issue__project", "issue__state").order_by("updated_at")
    held = WorkItemClaim.objects.filter(ended_at__isnull=True).values("issue_id")
    return rows.filter(agent_session=session), rows.filter(agent_session__isnull=True).exclude(issue_id__in=held)


def row_data(row, state):
    """An agent row as the APIs show it: the bot, the session it names, where it stands, and whether it is delegated."""
    bot_user = row.assignee
    session = row.agent_session
    return {
        "bot": {"id": str(bot_user.id), "display_name": bot_user.display_name},
        "session": {"id": str(session.id), "name": session.name, "status": session.status} if session else None,
        "state": state,
        "delegated": row.delegated,
    }
