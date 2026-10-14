# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Epics (E11): the Epic type, the roll-up of an epic's children and its health.

An epic is a work item of the workspace's Epic type (``IssueType.is_epic``), linked to each project that uses it
through ``ProjectIssueType``. Its children are its sub-items. Progress counts the children by state group (Review
apart from the other started states); cancelled children leave the scope. Health is the latest posted update and,
without one, is derived from the pace: the children finished in the last four weeks, projected onto what is left.
"""

# Python imports
import math
from datetime import date, datetime, time, timedelta

# Django imports
from django.db.models import Count, Q
from django.utils import timezone

# Module imports
from plane.db.models import (
    EpicDetail,
    EpicHealth,
    EpicUpdate,
    Issue,
    IssueRelation,
    IssueType,
    ProjectIssueType,
    State,
    StateGroup,
    WorkItemClaim,
)

EPIC_TYPE_NAME = "Epic"
PACE_WINDOW_DAYS = 28
BURNUP_WEEKS = 4

PROGRESS_KEYS = ("completed", "review", "started", "unstarted", "backlog", "cancelled")


def workspace_epic_type(workspace_id):
    """The workspace's Epic type, or None before the first epic."""
    return IssueType.objects.filter(workspace_id=workspace_id, is_epic=True).order_by("created_at").first()


def ensure_project_epic_type(project):
    """The Epic type, made for the workspace and linked to the project on first use (E11 item 1)."""
    issue_type = workspace_epic_type(project.workspace_id)
    if issue_type is None:
        issue_type = IssueType.objects.create(
            workspace_id=project.workspace_id, name=EPIC_TYPE_NAME, is_epic=True, level=1
        )
    if not ProjectIssueType.objects.filter(project=project, issue_type=issue_type).exists():
        ProjectIssueType.objects.create(project=project, issue_type=issue_type, level=1)
    return issue_type


def make_epic(issue, lead_id=None):
    """Turns a work item into an epic. Its details row is made at once, with the lead if one is given."""
    issue_type = ensure_project_epic_type(issue.project)
    if issue.type_id != issue_type.id:
        issue.type = issue_type
        issue.save(update_fields=["type", "updated_at"])
    detail, _ = EpicDetail.objects.get_or_create(epic=issue, defaults={"project_id": issue.project_id})
    if lead_id and not detail.lead_id:
        detail.lead_id = lead_id
        detail.save(update_fields=["lead", "updated_at"])
    return detail


def unmake_epic(issue):
    """Turns an epic back into a plain work item; its details and updates stay for a later conversion."""
    if issue.type_id and issue.type.is_epic:
        issue.type = None
        issue.save(update_fields=["type", "updated_at"])


def epic_queryset(**filters):
    return Issue.issue_objects.filter(type__is_epic=True, **filters)


def _children(epic_ids):
    return Issue.issue_objects.filter(parent_id__in=epic_ids)


def progress_by_epic(epic_ids):
    """Counts of each epic's children per bucket, plus the total in scope (everything but cancelled)."""
    review = Q(state__state_group__key="review")
    rows = (
        _children(epic_ids)
        .values("parent_id")
        .annotate(
            completed=Count("id", filter=Q(state__group=StateGroup.COMPLETED.value)),
            review=Count("id", filter=Q(state__group=StateGroup.STARTED.value) & review),
            started=Count("id", filter=Q(state__group=StateGroup.STARTED.value) & ~review),
            unstarted=Count("id", filter=Q(state__group=StateGroup.UNSTARTED.value)),
            backlog=Count("id", filter=Q(state__group=StateGroup.BACKLOG.value)),
            cancelled=Count("id", filter=Q(state__group=StateGroup.CANCELLED.value)),
        )
    )
    out = {}
    for row in rows:
        counts = {key: row[key] for key in PROGRESS_KEYS}
        counts["total"] = sum(counts[key] for key in PROGRESS_KEYS if key != "cancelled")
        out[row["parent_id"]] = counts
    return out


def empty_progress():
    return {**{key: 0 for key in PROGRESS_KEYS}, "total": 0}


def done_since_by_epic(epic_ids, since):
    """Children finished since a moment, per epic: the pace."""
    rows = (
        _children(epic_ids)
        .filter(state__group=StateGroup.COMPLETED.value, completed_at__gte=since)
        .values("parent_id")
        .annotate(count=Count("id"))
    )
    return {row["parent_id"]: row["count"] for row in rows}


def latest_update_by_epic(epic_ids):
    out = {}
    for update in EpicUpdate.objects.filter(epic_id__in=epic_ids).order_by("epic_id", "-created_at"):
        out.setdefault(update.epic_id, update)
    return out


def working_by_epic(epic_ids):
    """An open agent claim on one of each epic's children: who works on which item right now."""
    claims = (
        WorkItemClaim.objects.filter(
            issue__parent_id__in=epic_ids,
            ended_at__isnull=True,
            issue__deleted_at__isnull=True,
        )
        .select_related("issue", "session__bot__user")
        .order_by("-claimed_at")
    )
    out = {}
    for claim in claims:
        user = claim.session.bot.user
        out.setdefault(
            claim.issue.parent_id,
            {
                "issue_id": str(claim.issue_id),
                "sequence_id": claim.issue.sequence_id,
                "user_id": str(user.id),
                "display_name": user.display_name,
            },
        )
    return out


def derive_health(progress, target_date, today, done_recently):
    """Health from the pace, and the date the epic finishes at that pace.

    No verdict without a target, without children, or before any child has started. Past the target with work left
    is off track; otherwise the epic is at risk when the projected finish passes the target.
    """
    total = progress["total"]
    remaining = total - progress["completed"]
    if total == 0:
        return None, None
    if remaining == 0:
        return EpicHealth.ON_TRACK.value, None
    projected = None
    if done_recently:
        projected = today + timedelta(days=math.ceil(remaining * PACE_WINDOW_DAYS / done_recently))
    if target_date is None:
        return None, projected
    begun = progress["completed"] + progress["started"] + progress["review"] > 0
    if not begun:
        return None, projected
    if today > target_date:
        return EpicHealth.OFF_TRACK.value, projected
    if projected is None or projected > target_date:
        return EpicHealth.AT_RISK.value, projected
    return EpicHealth.ON_TRACK.value, projected


def serialize_update(update):
    if update is None:
        return None
    return {
        "id": str(update.id),
        "epic_id": str(update.epic_id),
        "health": update.health,
        "body": update.body,
        "created_at": update.created_at,
        "created_by": str(update.created_by_id) if update.created_by_id else None,
    }


def serialize_epics(epics, today=None):
    """The rows of the epic lists (r4-10, r4-11): the work item, its epic fields, progress and health."""
    today = today or timezone.localdate()
    epics = list(epics.select_related("state").prefetch_related("assignees", "labels").order_by("sequence_id"))
    ids = [epic.id for epic in epics]
    progress = progress_by_epic(ids)
    since = timezone.now() - timedelta(days=PACE_WINDOW_DAYS)
    done_recently = done_since_by_epic(ids, since)
    updates = latest_update_by_epic(ids)
    working = working_by_epic(ids)
    details = {detail.epic_id: detail for detail in EpicDetail.objects.filter(epic_id__in=ids)}

    rows = []
    for epic in epics:
        counts = progress.get(epic.id, empty_progress())
        detail = details.get(epic.id)
        update = updates.get(epic.id)
        derived, projected = derive_health(counts, epic.target_date, today, done_recently.get(epic.id, 0))
        rows.append(
            {
                "id": str(epic.id),
                "project_id": str(epic.project_id),
                "sequence_id": epic.sequence_id,
                "name": epic.name,
                "state_id": str(epic.state_id) if epic.state_id else None,
                "state_group": epic.state.group if epic.state else None,
                "priority": epic.priority,
                "start_date": epic.start_date,
                "target_date": epic.target_date,
                "completed_at": epic.completed_at,
                "assignee_ids": [str(user.id) for user in epic.assignees.all()],
                "label_ids": [str(label.id) for label in epic.labels.all()],
                "lead_id": str(detail.lead_id) if detail and detail.lead_id else None,
                "size": detail.size if detail else None,
                "wave_id": str(detail.wave_id) if detail and detail.wave_id else None,
                "progress": counts,
                "health": update.health if update else derived,
                "health_source": "update" if update else ("pace" if derived else None),
                "projected_date": projected,
                "latest_update": serialize_update(update),
                "working": working.get(epic.id),
            }
        )
    return rows


def burnup(epic, today=None):
    """Scope and done at the start of each of the last four weeks and today, from the children's dates."""
    today = today or timezone.localdate()
    children = list(
        _children([epic.id]).exclude(state__group=StateGroup.CANCELLED.value).values("created_at", "completed_at")
    )
    tz = timezone.get_current_timezone()
    points = []
    for weeks_back in range(BURNUP_WEEKS, -1, -1):
        day = today - timedelta(days=7 * weeks_back)
        moment = timezone.make_aware(datetime.combine(day, time.max), tz)
        scope = sum(1 for child in children if child["created_at"] <= moment)
        done = sum(1 for child in children if child["completed_at"] and child["completed_at"] <= moment)
        points.append({"date": day, "scope": scope, "done": done})
    return points


def added_since(epic, since):
    return _children([epic.id]).filter(created_at__gte=since).count()


def needs(epic, user):
    """The work items the epic is blocked by, in the projects the user is a member of."""
    blocker_ids = IssueRelation.objects.filter(issue=epic, relation_type="blocked_by").values_list(
        "related_issue_id", flat=True
    )
    items = (
        Issue.issue_objects.filter(
            pk__in=blocker_ids,
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
        )
        .select_related("state__state_group", "project")
        .order_by("sequence_id")
    )
    return [
        {
            "id": str(item.id),
            "project_id": str(item.project_id),
            "project_identifier": item.project.identifier,
            "sequence_id": item.sequence_id,
            "name": item.name,
            "state_id": str(item.state_id) if item.state_id else None,
            "state_group": item.state.group if item.state else None,
            "state_name": item.state.name if item.state else None,
            "is_review": bool(item.state and item.state.state_group_id and item.state.state_group.key == "review"),
        }
        for item in items
    ]


def review_state_ids(project_id):
    return [
        str(pk)
        for pk in State.objects.filter(project_id=project_id, state_group__key="review").values_list("id", flat=True)
    ]


def month_start(today):
    return timezone.make_aware(datetime.combine(today.replace(day=1), time.min), timezone.get_current_timezone())


def quarter_start(today):
    first_month = 3 * ((today.month - 1) // 3) + 1
    return timezone.make_aware(
        datetime.combine(date(today.year, first_month, 1), time.min), timezone.get_current_timezone()
    )
