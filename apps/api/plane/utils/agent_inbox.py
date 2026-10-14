# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent inboxes (E28, D18): what Plane has to tell a session, kept until the session acknowledges it.

Messages come from a comment that mentions a session or a bot, and from a comment on a work item a session holds.
A message for a session goes to that session; one for a bot, or for a session that has ended, goes to the bot's
queue, where any live session of that bot may take it. Transports (the agent bus, a hook, the MCP connection)
read the inbox over the API and acknowledge what they delivered, so a message reaches a session once.
"""

import uuid

from bs4 import BeautifulSoup
from django.db import connection, transaction
from django.db.models import Max, Q
from django.utils import timezone

from plane.db.models import (
    AgentInboxMessage,
    AgentSession,
    BotTypeEnum,
    Issue,
    ProjectMember,
    WorkItemClaim,
    WorkspaceBot,
)
from plane.utils.agent_session_context import active_session_id
from plane.utils.exception_logger import log_exception

# Held across the insert so that ``seq`` follows commit order; a reader past seq N never misses a lower one
INBOX_LOCK = 7105028001
PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
BODY_LIMIT = 1000

USER_MENTION = "user_mention"
SESSION_MENTION = "agent_session_mention"


def deliver(
    *,
    workspace_id,
    bot,
    session,
    kind,
    dedupe_key,
    issue=None,
    comment=None,
    actor=None,
    from_session=None,
    body="",
    data=None,
):
    """Add one message to a session's inbox, or to the bot's queue when ``session`` is None.

    A message whose ``dedupe_key`` was delivered before is dropped; returns the new message, or None.
    """
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [INBOX_LOCK])
        if AgentInboxMessage.objects.filter(dedupe_key=dedupe_key).exists():
            return None
        last = AgentInboxMessage.all_objects.aggregate(top=Max("seq"))["top"] or 0
        return AgentInboxMessage.objects.create(
            workspace_id=workspace_id,
            bot=bot,
            session=session,
            kind=kind,
            seq=last + 1,
            issue=issue,
            comment=comment,
            actor=actor,
            from_session=from_session,
            body=body,
            data=data or {},
            dedupe_key=dedupe_key,
        )


# ------------------------------------------------------------------ what comments cause


def agent_mentions(html):
    """The ``(entity_name, id)`` pairs of the mention chips in ``html`` that can name an agent."""
    if not html or "mention-component" not in html:
        return []
    found = []
    for tag in BeautifulSoup(html, "html.parser").find_all("mention-component"):
        name, ident = tag.get("entity_name"), tag.get("entity_identifier")
        if name not in (USER_MENTION, SESSION_MENTION) or not ident:
            continue
        try:
            found.append((name, str(uuid.UUID(ident))))
        except ValueError:
            continue
    return list(dict.fromkeys(found))


def _on_project(bot, project_id):
    return ProjectMember.objects.filter(project_id=project_id, member_id=bot.user_id, is_active=True).exists()


def _mentioned(mentions, workspace_id, project_id):
    """The ``(bot, session or None, note)`` each chip reaches: a live session, or a bot's queue."""
    reached = []
    for name, ident in mentions:
        if name == SESSION_MENTION:
            session = (
                AgentSession.objects.select_related("bot__user").filter(pk=ident, workspace_id=workspace_id).first()
            )
            if session is None:
                continue
            if session.status == AgentSession.Status.ENDED:
                reached.append((session.bot, None, f"for {session.name}, which has ended"))
            else:
                reached.append((session.bot, session, ""))
        else:
            bot = (
                WorkspaceBot.objects.select_related("user")
                .filter(user_id=ident, workspace_id=workspace_id, user__is_active=True)
                .exclude(user__bot_type=BotTypeEnum.SYSTEM)
                .first()
            )
            if bot is not None:
                reached.append((bot, None, ""))
    return [(bot, session, note) for bot, session, note in reached if _on_project(bot, project_id)]


def _words(text, actor_name, issue, identifier, what, note):
    text = (text or "").strip()
    if len(text) > BODY_LIMIT:
        text = text[:BODY_LIMIT].rstrip() + "..."
    head = f"{actor_name} {what} on {identifier}: {issue.name}"
    return f"{head} ({note})\n\n{text}" if note else f"{head}\n\n{text}"


def on_comment(comment):
    """Tell the sessions a comment concerns; never raises, a comment must save whatever happens here."""
    try:
        claim = (
            WorkItemClaim.objects.filter(issue_id=comment.issue_id, ended_at__isnull=True)
            .select_related("session__bot")
            .first()
        )
        _tell(
            html=comment.comment_html,
            text=comment.comment_stripped,
            issue_id=comment.issue_id,
            actor=comment.actor,
            author=comment.agent_session,
            source=f"comment:{comment.id}",
            comment=comment,
            holder=claim.session if claim is not None else None,
        )
    except Exception as error:
        log_exception(error)


def on_issue(issue):
    """Tell the sessions a work item's description mentions. A recipient hears about a work item once, however often
    its description is saved; the comments are where to ask again."""
    if "mention-component" not in (issue.description_html or ""):
        return
    try:
        session_id = active_session_id()
        _tell(
            html=issue.description_html,
            text=issue.description_stripped,
            issue_id=issue.id,
            actor=issue.updated_by or issue.created_by,
            author=AgentSession.objects.filter(pk=session_id).first() if session_id else None,
            source=f"issue:{issue.id}",
        )
    except Exception as error:
        log_exception(error)


def _tell(*, html, text, issue_id, actor, author, source, comment=None, holder=None):
    """Deliver what ``html`` mentions, and a comment on the item ``holder`` holds, as inbox messages."""
    mentions = agent_mentions(html)
    if not mentions and holder is None:
        return
    issue = Issue.objects.select_related("project").get(pk=issue_id)
    identifier = f"{issue.project.identifier}-{issue.sequence_id}"
    actor_name = (actor.display_name if actor else "") or "Someone"
    data = {"identifier": identifier, "issue_id": str(issue.id), "project_id": str(issue.project_id)}
    if comment is not None:
        data["comment_id"] = str(comment.id)

    def send(bot, session, kind, what, note=""):
        if session is not None and author is not None and session.id == author.id:
            return  # a session is not told about its own words
        target = f"session-{session.id}" if session is not None else f"bot-{bot.id}"
        deliver(
            workspace_id=issue.workspace_id,
            bot=bot,
            session=session,
            kind=kind,
            dedupe_key=f"{source}:{target}",
            issue=issue,
            comment=comment,
            actor=actor,
            from_session=author,
            body=_words(text, actor_name, issue, identifier, what, note),
            data={**data, "to": "session" if session is not None else "queue"},
        )

    for bot, session, note in _mentioned(mentions, issue.workspace_id, issue.project_id):
        what = "mentioned you" if session is not None else f"mentioned {bot.user.display_name}"
        send(bot, session, AgentInboxMessage.Kind.MENTION, what, note)
    if holder is not None:
        # A mention of the holder was delivered above and shares the key, so it is not told twice
        send(holder.bot, holder, AgentInboxMessage.Kind.COMMENT, "commented on an item you hold")


def on_assignment(row, bot, issue, actor=None, author=None):
    """Tell a session it was given a work item, or a bot's sessions that its queue has one."""
    try:
        session = row.agent_session
        if session is not None and session.status == AgentSession.Status.ENDED:
            session = None
        if session is not None and author is not None and session.id == author.id:
            return
        issue = Issue.objects.select_related("project").get(pk=issue.pk)
        identifier = f"{issue.project.identifier}-{issue.sequence_id}"
        what = "delegated" if row.delegated else "assigned"
        whom = "you" if session is not None else f"{bot.user.display_name}'s queue"
        target = f"session-{session.id}" if session is not None else f"bot-{bot.id}"
        stamp = int(row.updated_at.timestamp() * 1_000_000)
        deliver(
            workspace_id=issue.workspace_id,
            bot=bot,
            session=session,
            kind=AgentInboxMessage.Kind.ASSIGNMENT,
            dedupe_key=f"assignment:{row.id}:{target}:{what}:{stamp}",
            issue=issue,
            actor=actor,
            from_session=author,
            body=f"{(actor.display_name if actor else '') or 'Someone'} {what} {identifier}: {issue.name} to {whom}",
            data={
                "identifier": identifier,
                "issue_id": str(issue.id),
                "project_id": str(issue.project_id),
                "delegated": row.delegated,
                "to": "session" if session is not None else "queue",
            },
        )
    except Exception as error:
        log_exception(error)


# ------------------------------------------------------------------ reading and acknowledging


def inbox_for(session, include_acked=False):
    """What a session may read: its own messages and its bot's queue, minus the queue messages it wrote itself."""
    messages = AgentInboxMessage.objects.filter(
        Q(session=session) | Q(session__isnull=True, bot_id=session.bot_id)
    ).exclude(from_session=session)
    if not include_acked:
        messages = messages.filter(acked_at__isnull=True)
    return messages


def read(session, after=0, limit=PAGE_SIZE, include_acked=False):
    """``(messages, cursor, has_more)``: the next page after ``after``, oldest first."""
    limit = min(max(limit or PAGE_SIZE, 1), MAX_PAGE_SIZE)
    page = list(
        inbox_for(session, include_acked)
        .filter(seq__gt=after or 0)
        .select_related("issue__project", "actor", "from_session")
        .order_by("seq")[: limit + 1]
    )
    has_more = len(page) > limit
    page = page[:limit]
    return page, (page[-1].seq if page else (after or 0)), has_more


def acknowledge(session, ids=None, through=None):
    """Mark messages delivered, by id or everything up to a cursor; returns how many were newly acknowledged.

    A queue message goes to whichever session acknowledges it first.
    """
    messages = inbox_for(session)
    if ids is not None:
        messages = messages.filter(pk__in=ids)
    if through is not None:
        messages = messages.filter(seq__lte=through)
    now = timezone.now()
    return messages.update(acked_at=now, acked_by=session, updated_at=now)
