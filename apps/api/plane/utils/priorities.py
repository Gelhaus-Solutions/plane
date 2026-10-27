# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace priorities (E35): the built-in rows, and finding a priority by what a caller wrote."""

import uuid

from django.db import IntegrityError, transaction
from django.db.models import Case, Count, F, FloatField, Q, Value, When

from plane.db.models import BUILTIN_PRIORITIES, PRIORITY_LEVELS, Issue, WorkspacePriority

LEVELS = tuple(level for level, _ in PRIORITY_LEVELS)


def builtin_priorities(workspace_id):
    """The workspace's built-in priorities by level, made on first use."""
    rows = {row.key: row for row in WorkspacePriority.objects.filter(workspace_id=workspace_id, key__isnull=False)}
    for spec in BUILTIN_PRIORITIES:
        if spec["key"] in rows:
            continue
        try:
            with transaction.atomic():
                rows[spec["key"]] = WorkspacePriority.objects.create(workspace_id=workspace_id, is_builtin=True, **spec)
        except IntegrityError:
            existing = WorkspacePriority.objects.filter(workspace_id=workspace_id, key=spec["key"]).first()
            if existing is None:
                existing = WorkspacePriority.objects.create(
                    workspace_id=workspace_id, is_builtin=True, **{**spec, "name": f"{spec['name']} (built-in)"}
                )
            rows[spec["key"]] = existing
    return rows


def find_priority(workspace_id, value):
    """A custom or built-in priority named by its id or its name (any case), or None."""
    if not value or not workspace_id:
        return None
    rows = WorkspacePriority.objects.filter(workspace_id=workspace_id)
    try:
        return rows.filter(pk=uuid.UUID(str(value))).first()
    except ValueError:
        return rows.filter(Q(name__iexact=str(value)) | Q(key=str(value).lower())).first()


def priority_rank(levels=LEVELS):
    """A sort key: the level's place in ``levels``, then the custom priority's own order within the level (E35)."""
    return Case(
        *[When(priority=level, then=Value(rank * 1_000_000.0)) for rank, level in enumerate(levels)],
        default=Value(len(levels) * 1_000_000.0),
        output_field=FloatField(),
    ) + Case(
        When(priority_option__isnull=True, then=Value(0.0)),
        When(priority_option__is_builtin=True, then=Value(0.0)),
        default=F("priority_option__sequence"),
        output_field=FloatField(),
    )


def item_counts(workspace_id):
    """How many work items show each of the workspace's priorities, by id: a custom one counts the items that name
    it, a built-in one also the items at its level that name none."""
    items = Issue.issue_objects.filter(workspace_id=workspace_id)
    named = {
        row["priority_option_id"]: row["count"]
        for row in items.filter(priority_option__isnull=False).values("priority_option_id").annotate(count=Count("id"))
    }
    plain = {
        row["priority"]: row["count"]
        for row in items.filter(priority_option__isnull=True).values("priority").annotate(count=Count("id"))
    }
    counts = {}
    for row in WorkspacePriority.objects.filter(workspace_id=workspace_id):
        counts[row.id] = named.get(row.id, 0) + (plain.get(row.level, 0) if row.is_builtin else 0)
    return counts
