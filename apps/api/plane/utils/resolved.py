# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Work over time (D47): a work item is resolved when it is done or cancelled, done items at their completed_at and
cancelled ones at the last change of their state. Counts over time keep archived items, so archiving finished work
does not take it out of the history."""

from django.db.models import Case, DateTimeField, F, OuterRef, Subquery, When
from django.db.models.functions import Coalesce

from plane.db.models import Issue, IssueActivity

RESOLVED_GROUPS = ("completed", "cancelled")


def resolved_at():
    """An annotation: when the item was resolved, or None while it is open."""
    last_state_change = (
        IssueActivity.objects.filter(issue_id=OuterRef("pk"), field="state")
        .order_by("-created_at")
        .values("created_at")[:1]
    )
    return Case(
        When(state__group="completed", then=Coalesce(F("completed_at"), F("updated_at"))),
        When(state__group="cancelled", then=Coalesce(Subquery(last_state_change), F("updated_at"))),
        default=None,
        output_field=DateTimeField(),
    )


def history_issues(project_ids):
    """The work items counted over time: archived ones included; drafts, triage and deleted ones not."""
    return Issue.objects.filter(project_id__in=project_ids, is_draft=False, project__archived_at__isnull=True).exclude(
        state__group="triage"
    )


def running(counts, before):
    """A running total: what came before the first bucket, then each bucket added on."""
    out, total = [], before
    for count in counts:
        total += count
        out.append(total)
    return out


def total_and_resolved(issues, period):
    """Per bucket, how many items existed and how many of them were resolved by its end."""
    start, _ = period.bounds()
    resolved = issues.filter(state__group__in=RESOLVED_GROUPS).annotate(resolved=resolved_at())
    return {
        "total": running(
            period.series(issues.filter(**period.contains("created_at")).values_list("created_at", flat=True)),
            issues.filter(created_at__lt=start).count(),
        ),
        "resolved": running(
            period.series(resolved.filter(**period.contains("resolved")).values_list("resolved", flat=True)),
            resolved.filter(resolved__lt=start).count(),
        ),
    }
