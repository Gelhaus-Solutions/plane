# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""What the Agents page shows (E28, D46): each bot's queue, what a session touched and handed over, and the session
panel with its items, claims, handoffs, inbox and recent activity.

Work items appear only from projects the viewer is an active member of; the sessions themselves are workspace-wide.
"""

from django.db.models import Q

from plane.db.models import (
    AgentInboxMessage,
    AgentSession,
    Issue,
    IssueActivity,
    IssueAssignee,
    ProjectMember,
    State,
    WorkItemClaim,
)
from plane.utils.agent_assignments import CLOSED_GROUPS

QUEUE_LIMIT = 50
RECENT_LIMIT = 15
INBOX_LIMIT = 50
BODY_LIMIT = 300


def visible_project_ids(user, slug):
    return {
        str(project_id)
        for project_id in ProjectMember.objects.filter(workspace__slug=slug, member=user, is_active=True).values_list(
            "project_id", flat=True
        )
    }


def item_ref(issue):
    return {
        "id": str(issue.id),
        "project_id": str(issue.project_id),
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "name": issue.name,
    }


def state_group(issue):
    return issue.state.group if issue.state_id else None


def _session_ref(session):
    return {"id": str(session.id), "name": session.name, "status": session.status}


def _open_rows(**filters):
    return (
        IssueAssignee.objects.filter(
            assignee__is_bot=True,
            issue__deleted_at__isnull=True,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
            **filters,
        )
        .exclude(issue__state__group__in=CLOSED_GROUPS)
        .select_related("assignee", "issue__project", "issue__state")
        .order_by("created_at")
    )


def queues(slug, visible):
    """Per bot, the open items assigned or delegated to it alone that no session holds: what its next session takes."""
    held = WorkItemClaim.objects.filter(workspace__slug=slug, ended_at__isnull=True).values("issue_id")
    rows = _open_rows(workspace__slug=slug, agent_session__isnull=True, issue__project_id__in=visible)
    by_bot = {}
    for row in rows.exclude(issue_id__in=held):
        entry = by_bot.setdefault(
            row.assignee_id,
            {"bot": {"id": str(row.assignee_id), "display_name": row.assignee.display_name}, "count": 0, "items": []},
        )
        entry["count"] += 1
        if len(entry["items"]) < QUEUE_LIMIT:
            entry["items"].append(
                {**item_ref(row.issue), "state_group": state_group(row.issue), "delegated": row.delegated}
            )
    return list(by_bot.values())


def touched(session_ids, visible):
    """Per session, the items it claimed or changed, the first one it touched first."""
    first = {}
    claims = WorkItemClaim.objects.filter(session_id__in=session_ids, issue__project_id__in=visible)
    activities = IssueActivity.objects.filter(
        agent_session_id__in=session_ids, issue__isnull=False, project_id__in=visible
    )
    for session_id, issue_id, at in [
        *claims.values_list("session_id", "issue_id", "claimed_at"),
        *activities.values_list("agent_session_id", "issue_id", "created_at"),
    ]:
        key = (session_id, issue_id)
        if key not in first or at < first[key]:
            first[key] = at
    issues = {
        issue.id: issue
        for issue in Issue.objects.filter(pk__in={issue_id for _, issue_id in first}).select_related("project", "state")
    }
    result = {}
    for (session_id, issue_id), _ in sorted(first.items(), key=lambda pair: pair[1]):
        if issue_id in issues:
            issue = issues[issue_id]
            result.setdefault(session_id, []).append({**item_ref(issue), "state_group": state_group(issue)})
    return result


def _handed_items(data, name, visible):
    """The items of a handover message that came from the named session (older messages do not say, so all of them)."""
    return [
        {
            "id": item.get("issue_id"),
            "project_id": item.get("project_id"),
            "identifier": item.get("identifier"),
            "name": item.get("name"),
        }
        for item in data.get("items", [])
        if item.get("from_session", name) == name and item.get("project_id") in visible
    ]


def handoffs(sessions, visible):
    """Per ended session: the later session it handed its items to, and the items still waiting for one (D20)."""
    ended = [session for session in sessions if session.status == AgentSession.Status.ENDED]
    if not ended:
        return {}
    result = {session.id: {"to": None, "items": [], "waiting": []} for session in ended}
    by_name = {(session.bot_id, session.name): session for session in ended}
    messages = AgentInboxMessage.objects.filter(
        bot_id__in={session.bot_id for session in ended},
        kind=AgentInboxMessage.Kind.HANDOVER,
        session__isnull=False,
        created_at__gte=min(session.started_at for session in ended),
    ).select_related("session")
    for message in messages.order_by("seq"):
        data = message.data or {}
        for name in data.get("from_sessions", []):
            source = by_name.get((message.bot_id, name))
            if source is None:
                continue
            entry = result[source.id]
            entry["to"] = _session_ref(message.session)
            entry["items"] += _handed_items(data, name, visible)
    waiting = _open_rows(agent_session_id__in=[session.id for session in ended], issue__project_id__in=visible)
    for row in waiting:
        result[row.agent_session_id]["waiting"].append(item_ref(row.issue))
    return result


def _activity_kind(activity, completed_states):
    if activity.verb == "created" and not activity.field:
        return "filed"
    if activity.field == "state" and activity.new_identifier in completed_states:
        return "completed"
    if activity.field == "comment":
        return "commented"
    return "updated"


def panel(session, visible):
    """The session panel (r6-10): the items it touched and how, its claims, handoffs, inbox and recent activity."""
    activities = list(
        IssueActivity.objects.filter(agent_session=session, issue__isnull=False, project_id__in=visible)
        .select_related("issue__project")
        .order_by("-created_at")
    )
    completed_states = set(
        State.all_state_objects.filter(
            pk__in={activity.new_identifier for activity in activities if activity.field == "state"},
            group="completed",
        ).values_list("id", flat=True)
    )
    claims = list(
        WorkItemClaim.objects.filter(session=session, issue__project_id__in=visible)
        .select_related("issue__project", "issue__state")
        .order_by("-claimed_at")
    )

    items = {}

    def note(issue, role, at):
        entry = items.setdefault(issue.id, {**item_ref(issue), "state_group": None, "roles": [], "at": at})
        if role not in entry["roles"]:
            entry["roles"].append(role)
        entry["at"] = max(entry["at"], at)

    for claim in claims:
        note(claim.issue, "holds" if claim.ended_at is None else "claimed", claim.claimed_at)
    for activity in activities:
        if activity.issue.deleted_at is None:
            note(activity.issue, _activity_kind(activity, completed_states), activity.created_at)
    for row in IssueAssignee.objects.filter(agent_session=session, issue__project_id__in=visible).select_related(
        "issue__project"
    ):
        note(row.issue, "delegated" if row.delegated else "assigned", row.created_at)
    groups = dict(Issue.objects.filter(pk__in=items.keys()).values_list("id", "state__group"))
    for issue_id, entry in items.items():
        entry["state_group"] = groups.get(issue_id)

    recent = [
        {
            "kind": _activity_kind(activity, completed_states),
            "field": activity.field,
            "item": item_ref(activity.issue),
            "at": activity.created_at,
        }
        for activity in activities[:RECENT_LIMIT]
    ]
    for claim in claims:
        recent.append({"kind": "claimed", "field": None, "item": item_ref(claim.issue), "at": claim.claimed_at})
        if claim.ended_at:
            recent.append({"kind": "released", "field": None, "item": item_ref(claim.issue), "at": claim.ended_at})
    recent = sorted(recent, key=lambda entry: entry["at"], reverse=True)[:RECENT_LIMIT]

    received = []
    for message in AgentInboxMessage.objects.filter(session=session, kind=AgentInboxMessage.Kind.HANDOVER).order_by(
        "seq"
    ):
        data = message.data or {}
        names = data.get("from_sessions", [])
        earlier = AgentSession.objects.filter(bot_id=session.bot_id, name__in=names).order_by("-started_at")
        known = {}
        for earlier_session in earlier:
            known.setdefault(earlier_session.name, _session_ref(earlier_session))
        received.append(
            {
                "from_sessions": [known.get(name, {"id": None, "name": name, "status": "ended"}) for name in names],
                "items": [item for name in names for item in _handed_items(data, name, visible)],
                "at": message.created_at,
                "acked_at": message.acked_at,
            }
        )
    given = handoffs([session], visible).get(session.id)

    inbox = []
    messages = (
        AgentInboxMessage.objects.filter(Q(session=session) | Q(acked_by=session))
        .select_related("issue__project", "actor", "from_session")
        .order_by("-seq")[:INBOX_LIMIT]
    )
    for message in messages:
        if message.issue_id and str(message.issue.project_id) not in visible:
            continue
        inbox.append(
            {
                "id": str(message.id),
                "kind": message.kind,
                "body": message.body[:BODY_LIMIT],
                "item": item_ref(message.issue) if message.issue_id else None,
                "actor": message.actor.display_name if message.actor_id else None,
                "from_session": _session_ref(message.from_session) if message.from_session_id else None,
                "queue": message.session_id is None,
                "at": message.created_at,
                "acked_at": message.acked_at,
            }
        )

    return {
        "items": sorted(items.values(), key=lambda entry: entry["at"], reverse=True),
        "claims": [
            {
                "item": item_ref(claim.issue),
                "claimed_at": claim.claimed_at,
                "ended_at": claim.ended_at,
                "end_reason": claim.end_reason,
            }
            for claim in claims
        ],
        "handoffs": {
            "received": received,
            "given": {"to": given["to"], "items": given["items"]} if given and given["to"] else None,
            "waiting": given["waiting"] if given else [],
        },
        "inbox": inbox,
        "recent": recent,
    }
