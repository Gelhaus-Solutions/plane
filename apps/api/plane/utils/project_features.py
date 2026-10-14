# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The per-feature project settings of the Features page (D45): who new intake requests go to, where accepted ones
land, and what a new module starts with. The scheduled parts live in ``plane.bgtasks.project_feature_task``."""

from plane.db.models import IssueAssignee, ProjectMember, State, StateGroup


def intake_assignee_id(project):
    """The member a new intake request is assigned to, or None."""
    if project.intake_assignee == "project_lead":
        return project.project_lead_id
    if project.intake_assignee == "default_assignee":
        return project.default_assignee_id
    return None


def assign_intake_issue(issue, project):
    """Assigns a request made outside the app's create path (the API, the public form) by the project's rule."""
    assignee_id = intake_assignee_id(project)
    if not assignee_id or IssueAssignee.objects.filter(issue=issue).exists():
        return
    # as in the app's create path: only an active member who may own work
    if ProjectMember.objects.filter(
        project_id=project.id, member_id=assignee_id, role__gte=15, is_active=True
    ).exists():
        IssueAssignee.objects.create(
            issue=issue, assignee_id=assignee_id, project_id=project.id, workspace_id=project.workspace_id
        )


def intake_accepted_state(project):
    """The state an accepted request moves to: the project's choice, else its default state."""
    chosen = project.intake_accepted_state
    if (
        chosen is not None
        and chosen.deleted_at is None
        and chosen.project_id == project.id
        and chosen.group != StateGroup.TRIAGE.value
    ):
        return chosen
    return State.objects.filter(project_id=project.id, default=True).first()


def module_defaults(project, data):
    """The lead and status a new module gets when the request leaves them out."""
    out = {}
    if "status" not in data:
        out["status"] = project.module_default_status
    if "lead_id" not in data and "lead" not in data and project.module_default_lead == "project_lead":
        out["lead_id"] = project.project_lead_id
    return out
