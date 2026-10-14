# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The scheduled parts of the project's Features page (D45): carrying unfinished work into the next cycle, archiving
completed cycles and declining intake requests nobody handled. Each runs for the projects that turned it on, and acts as
the workspace's system bot."""

# Python imports
import json
from datetime import timedelta

# Third party imports
from celery import shared_task

# Django imports
from django.db.models import Q
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Cycle, IntakeIssue, IssueComment, Project, UserFavorite
from plane.db.models.intake import IntakeIssueStatus
from plane.utils.bots import system_bot
from plane.utils.cycle_transfer_issues import transfer_cycle_issues
from plane.utils.exception_logger import log_exception

# An ended cycle is carried over within this window; older ones were over before the setting could act on them
CARRY_OVER_WINDOW = timedelta(days=7)


def _actor_id(project):
    try:
        return system_bot(project.workspace).user_id
    except Exception as e:  # a missing bot must not stop the automation
        log_exception(e)
        return project.created_by_id


def next_cycle(cycle, now):
    """The cycle unfinished work moves to: the running one, else the next to start."""
    later = Cycle.objects.filter(
        project_id=cycle.project_id, archived_at__isnull=True, start_date__isnull=False, end_date__gt=now
    ).exclude(pk=cycle.pk)
    return later.filter(start_date__lte=now).order_by("start_date").first() or later.order_by("start_date").first()


@shared_task
def carry_over_ended_cycles():
    """Moves the unfinished work items of each cycle that just ended into the next cycle."""
    now = timezone.now()
    projects = Project.objects.filter(cycle_view=True, cycle_auto_carry_over=True, archived_at__isnull=True)
    for project in projects.select_related("workspace"):
        ended = Cycle.objects.filter(
            project=project,
            archived_at__isnull=True,
            carried_over_at__isnull=True,
            end_date__lt=now,
            end_date__gte=now - CARRY_OVER_WINDOW,
        ).order_by("end_date")
        for cycle in ended:
            try:
                # a cycle completed by hand already has its snapshot and its items moved
                if cycle.progress_snapshot:
                    Cycle.objects.filter(pk=cycle.pk).update(carried_over_at=now)
                    continue
                target = next_cycle(cycle, now)
                if target is None:
                    # tried again on the next run, in case the next cycle is made later
                    continue
                result = transfer_cycle_issues(
                    slug=project.workspace.slug,
                    project_id=project.id,
                    cycle_id=cycle.id,
                    new_cycle_id=target.id,
                    request=None,
                    user_id=_actor_id(project),
                )
                if result.get("success"):
                    Cycle.objects.filter(pk=cycle.pk).update(carried_over_at=now)
            except Exception as e:
                log_exception(e)


@shared_task
def archive_completed_cycles():
    """Archives the cycles that ended more than the project's months ago (30 days each, as for work items)."""
    now = timezone.now()
    for project in Project.objects.filter(cycle_archive_in__gt=0, archived_at__isnull=True):
        try:
            cycles = Cycle.objects.filter(
                project=project,
                archived_at__isnull=True,
                end_date__lt=now - timedelta(days=project.cycle_archive_in * 30),
            )
            ids = list(cycles.values_list("id", flat=True))
            if not ids:
                continue
            Cycle.objects.filter(pk__in=ids).update(archived_at=now)
            UserFavorite.objects.filter(entity_type="cycle", entity_identifier__in=ids, project_id=project.id).delete()
        except Exception as e:
            log_exception(e)


@shared_task
def decline_stale_intake_requests():
    """Declines the pending requests nobody touched for the project's number of days, with a note on each."""
    now = timezone.now()
    projects = Project.objects.filter(intake_view=True, intake_decline_after_days__gt=0, archived_at__isnull=True)
    for project in projects.select_related("workspace"):
        try:
            cutoff = now - timedelta(days=project.intake_decline_after_days)
            stale = IntakeIssue.objects.filter(
                project=project,
                status=IntakeIssueStatus.PENDING,
                updated_at__lt=cutoff,
                issue__updated_at__lt=cutoff,
                issue__deleted_at__isnull=True,
            ).filter(Q(snoozed_till__isnull=True) | Q(snoozed_till__lt=now))
            requests = list(stale.select_related("issue"))
            if not requests:
                continue
            actor_id = _actor_id(project)
            days = project.intake_decline_after_days
            for request in requests:
                IntakeIssue.objects.filter(pk=request.pk).update(status=IntakeIssueStatus.REJECTED, updated_at=now)
                IssueComment.objects.create(
                    issue_id=request.issue_id,
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    actor_id=actor_id,
                    comment_html=f"<p>Declined automatically: nobody answered this request for {days} days.</p>",
                    comment_stripped=f"Declined automatically: nobody answered this request for {days} days.",
                )
                issue_activity.delay(
                    type="intake.activity.created",
                    requested_data=json.dumps({"status": IntakeIssueStatus.REJECTED, "automation": True}),
                    actor_id=str(actor_id),
                    issue_id=str(request.issue_id),
                    project_id=str(project.id),
                    current_instance=json.dumps({"status": IntakeIssueStatus.PENDING}),
                    epoch=int(now.timestamp()),
                    notification=True,
                    intake=str(request.id),
                )
        except Exception as e:
            log_exception(e)
