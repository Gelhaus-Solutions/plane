# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# The data half of 0126, in its own migration: Postgres refuses the index 0126 adds on states once rows of states
# have changed in the same transaction ("pending trigger events").

from django.db import migrations
from django.db.models import Max, Min
from django.template.defaultfilters import slugify

# A copy, so this migration does not change when the live constants do
BUILTIN = [
    {"key": "backlog", "name": "Backlog", "category": "backlog", "color": "#60646C", "sequence": 15000},
    {"key": "unstarted", "name": "Unstarted", "category": "unstarted", "color": "#60646C", "sequence": 25000},
    {"key": "started", "name": "Started", "category": "started", "color": "#F59E0B", "sequence": 35000},
    {"key": "review", "name": "Review", "category": "started", "color": "#8B5CF6", "sequence": 40000},
    {"key": "completed", "name": "Completed", "category": "completed", "color": "#46A758", "sequence": 45000},
    {"key": "cancelled", "name": "Cancelled", "category": "cancelled", "color": "#9AA4BC", "sequence": 55000},
]
CATEGORIES = ("backlog", "unstarted", "started", "completed", "cancelled")
REVIEW_NAMES = ("Review", "In Review", "Agent Review")


def review_sequence(last_started, first_completed):
    """Between the last started state and the first completed one, so Review sits before Done on the board."""
    if last_started is not None and first_completed is not None and first_completed > last_started:
        return (last_started + first_completed) / 2
    if last_started is not None:
        return last_started + 1000
    if first_completed is not None:
        return first_completed - 1000
    return 40000


def add_review_state(State, project, review):
    """A Review state in the project (D37): adopt a started state already named so, else add one."""
    states = State.objects.filter(project=project, deleted_at__isnull=True)
    if states.filter(state_group=review).exists():
        return
    name = None
    for candidate in REVIEW_NAMES:
        existing = states.filter(name__iexact=candidate).first()
        if existing is None:
            name = candidate
            break
        if existing.group == "started":
            existing.state_group = review
            existing.save(update_fields=["state_group"])
            return
    name = name or "Review 2"
    sequence = review_sequence(
        states.filter(group="started").aggregate(value=Max("sequence"))["value"],
        states.filter(group="completed").aggregate(value=Min("sequence"))["value"],
    )
    State.objects.create(
        project=project,
        workspace_id=project.workspace_id,
        name=name,
        slug=slugify(name),
        color="#8B5CF6",
        group="started",
        state_group=review,
        sequence=sequence,
    )


def forwards(apps, schema_editor):
    Workspace = apps.get_model("db", "Workspace")
    Project = apps.get_model("db", "Project")
    State = apps.get_model("db", "State")
    Group = apps.get_model("db", "WorkspaceStateGroup")
    for workspace in Workspace.objects.all():
        rows = {}
        for spec in BUILTIN:
            rows[spec["key"]] = Group.objects.filter(
                workspace=workspace, key=spec["key"], deleted_at__isnull=True
            ).first() or (Group.objects.create(workspace=workspace, is_builtin=True, **spec))
        for category in CATEGORIES:
            State.objects.filter(workspace=workspace, group=category, state_group__isnull=True).update(
                state_group=rows[category]
            )
        for project in Project.objects.filter(workspace=workspace, deleted_at__isnull=True):
            add_review_state(State, project, rows["review"])


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0126_state_groups"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
