# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace state groups (E30): the built-in rows, and the default states a new project gets."""

from django.db import IntegrityError, transaction

from plane.db.models import BUILTIN_STATE_GROUPS, DEFAULT_STATES, State, StateGroup, WorkspaceStateGroup


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
