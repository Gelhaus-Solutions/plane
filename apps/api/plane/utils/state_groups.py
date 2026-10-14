# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace state groups (E30): the built-in rows, and the default states a new project gets."""

from django.db import IntegrityError, transaction

from django.db.models import Max, Min

from plane.db.models import BUILTIN_STATE_GROUPS, DEFAULT_STATES, Project, State, StateGroup, WorkspaceStateGroup

REVIEW_NAMES = ("Review", "In Review", "Agent Review")


def builtin_state_groups(workspace_id):
    """The workspace's built-in groups by key, made on first use. A category's key is the category itself."""
    rows = {row.key: row for row in WorkspaceStateGroup.objects.filter(workspace_id=workspace_id, key__isnull=False)}
    for spec in BUILTIN_STATE_GROUPS:
        if spec["key"] in rows:
            continue
        try:
            with transaction.atomic():
                rows[spec["key"]] = WorkspaceStateGroup.objects.create(
                    workspace_id=workspace_id, is_builtin=True, **spec
                )
        except IntegrityError:
            # Made at the same moment elsewhere, or a custom group already has the name
            existing = WorkspaceStateGroup.objects.filter(workspace_id=workspace_id, key=spec["key"]).first()
            if existing is None:
                existing = WorkspaceStateGroup.objects.create(
                    workspace_id=workspace_id, is_builtin=True, **{**spec, "name": f"{spec['name']} (built-in)"}
                )
            rows[spec["key"]] = existing
    return rows


def default_states(project, created_by=None):
    """Unsaved State rows for a new project, each in its built-in group (Review included, D37)."""
    groups = builtin_state_groups(project.workspace_id)
    return [
        State(
            name=spec["name"],
            color=spec["color"],
            project=project,
            sequence=spec["sequence"],
            workspace_id=project.workspace_id,
            group=spec["group"],
            state_group=None
            if spec["group"] == StateGroup.TRIAGE.value
            else groups[spec.get("state_group", spec["group"])],
            default=spec.get("default", False),
            created_by=created_by,
        )
        for spec in DEFAULT_STATES
    ]


def review_sequence(last_started, first_completed):
    """Between the last started state and the first completed one, so Review sits before Done on the board."""
    if last_started is not None and first_completed is not None and first_completed > last_started:
        return (last_started + first_completed) / 2
    if last_started is not None:
        return last_started + 1000
    if first_completed is not None:
        return first_completed - 1000
    return 40000


def review_state(project_id):
    """The project's Review state (D37); made here if the project somehow has none."""
    state = (
        State.objects.filter(project_id=project_id, state_group__key="review", state_group__deleted_at__isnull=True)
        .order_by("sequence")
        .first()
    )
    if state is not None:
        return state
    project = Project.objects.get(pk=project_id)
    states = State.objects.filter(project_id=project_id)
    taken = {name.lower() for name in states.values_list("name", flat=True)}
    name = next((n for n in REVIEW_NAMES if n.lower() not in taken), "Review 2")
    state = State.objects.create(
        project=project,
        name=name,
        color="#8B5CF6",
        group=StateGroup.STARTED.value,
        state_group=builtin_state_groups(project.workspace_id)["review"],
    )
    # State.save puts a new state last; Review belongs between the started and the completed ones
    sequence = review_sequence(
        states.filter(group=StateGroup.STARTED.value).exclude(pk=state.pk).aggregate(value=Max("sequence"))["value"],
        states.filter(group=StateGroup.COMPLETED.value).aggregate(value=Min("sequence"))["value"],
    )
    State.objects.filter(pk=state.pk).update(sequence=sequence)
    state.sequence = sequence
    return state
