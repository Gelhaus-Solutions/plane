# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The workspace analytics screens (r5-10): one period, a set of projects, and per tab what its tiles, charts and
tables show. Work counts for its assignees; an item with a bot among its assignees counts as the bots' work."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    Cycle,
    IntakeIssue,
    Issue,
    IssueAssignee,
    Module,
    Profile,
    Project,
    User,
)
from plane.utils.build_chart import bot_assigned, build_analytics_chart
from plane.utils.pql.backend import apply_pql
from plane.utils.pql.compiler import PQLContext
from plane.utils.resolved import history_issues, total_and_resolved

OPEN_GROUPS = ("backlog", "unstarted", "started")
DEFAULT_DAYS = 90
MAX_DAYS = 366
# Up to a month the charts count per day, past that per week
DAILY_UP_TO = 31


def week_start_of(user):
    """The user's first day of the week, Monday as 0: Profile counts from Sunday, Python from Monday."""
    week_start = Profile.objects.filter(user_id=user.id).values_list("start_of_the_week", flat=True).first()
    return ((week_start or 0) + 6) % 7


class Period:
    """A run of whole days in the viewer's time zone, cut into days or weeks that start on the viewer's first day."""

    def __init__(self, start, end, tz, week_start):
        self.start = start
        self.end = end
        self.tz = tz
        self.week_start = week_start
        self.days = (end - start).days + 1
        self.bucket = "day" if self.days <= DAILY_UP_TO else "week"

    @classmethod
    def from_request(cls, request):
        tz = ZoneInfo(request.user.user_timezone or "UTC")
        today = timezone.now().astimezone(tz).date()
        end = date.fromisoformat(request.GET["end"]) if request.GET.get("end") else today
        start = (
            date.fromisoformat(request.GET["start"])
            if request.GET.get("start")
            else end - timedelta(days=DEFAULT_DAYS - 1)
        )
        if start > end or (end - start).days + 1 > MAX_DAYS:
            raise ValueError(f"A period runs forwards and covers at most {MAX_DAYS} days")
        return cls(start, end, tz, week_start_of(request.user))

    @classmethod
    def last_days(cls, user, days):
        """The last ``days`` whole days, today included, in the user's time zone."""
        tz = ZoneInfo(user.user_timezone or "UTC")
        end = timezone.now().astimezone(tz).date()
        return cls(end - timedelta(days=days - 1), end, tz, week_start_of(user))

    def previous(self):
        """The period of the same length just before this one."""
        return Period(self.start - timedelta(days=self.days), self.start - timedelta(days=1), self.tz, self.week_start)

    def bounds(self):
        """The period as aware datetimes, the end exclusive."""
        return (
            datetime.combine(self.start, time.min, tzinfo=self.tz),
            datetime.combine(self.end + timedelta(days=1), time.min, tzinfo=self.tz),
        )

    def contains(self, prefix):
        """Query filters for a datetime field in the period."""
        start, end = self.bounds()
        return {f"{prefix}__gte": start, f"{prefix}__lt": end}

    def bucket_of(self, day):
        if self.bucket == "day":
            return day
        return day - timedelta(days=(day.weekday() - self.week_start) % 7)

    def buckets(self):
        first, last = self.bucket_of(self.start), self.bucket_of(self.end)
        step = timedelta(days=1 if self.bucket == "day" else 7)
        out = []
        while first <= last:
            out.append(first)
            first += step
        return out

    def series(self, moments):
        """How many of the datetimes fall in each bucket."""
        index = {b: i for i, b in enumerate(self.buckets())}
        counts = [0] * len(index)
        for moment in moments:
            if moment is None:
                continue
            i = index.get(self.bucket_of(moment.astimezone(self.tz).date()))
            if i is not None:
                counts[i] += 1
        return counts

    def as_dict(self):
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "days": self.days,
            "bucket": self.bucket,
            "buckets": [b.isoformat() for b in self.buckets()],
        }


def aligned(values, length):
    """A previous period's series cut or padded to the current one's length, so index i compares with index i."""
    return (values + [0] * length)[:length]


def median_days(pairs):
    """The median time from created to done, in days with one decimal, or None without done items."""
    spans = [
        (done - created).total_seconds() / 86400 for created, done in pairs if created and done and done >= created
    ]
    return round(median(spans), 1) if spans else None


def member_name(user):
    if user.is_bot:
        return user.first_name or user.display_name
    return f"{user.first_name} {user.last_name}".strip() or user.display_name


class AnalyticsInsightsEndpoint(BaseAPIView):
    """GET ?tab=overview|work-items|cycles|modules|intake|people&start=&end=&project_ids= (dates as YYYY-MM-DD)."""

    def scope(self, slug):
        """The projects the viewer is an active member of, narrowed to ?project_ids= when given."""
        projects = Project.objects.filter(
            workspace__slug=slug,
            project_projectmember__member=self.request.user,
            project_projectmember__is_active=True,
            archived_at__isnull=True,
        )
        wanted = [p for p in self.request.GET.get("project_ids", "").split(",") if p]
        if wanted:
            projects = projects.filter(id__in=wanted)
        return list(projects.values_list("id", flat=True))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        try:
            period = Period.from_request(request)
        except ValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        project_ids = self.scope(slug)
        issues = Issue.issue_objects.filter(project_id__in=project_ids)
        handlers = {
            "overview": lambda: self.overview(issues, period, project_ids),
            "work-items": lambda: self.work_items(issues, period, slug),
            "cycles": lambda: self.cycles(period, project_ids),
            "modules": lambda: self.modules(issues, period, project_ids),
            "intake": lambda: self.intake(period, project_ids),
            "people": lambda: self.people(issues, period),
        }
        handler = handlers.get(request.GET.get("tab", "overview"))
        if handler is None:
            return Response({"error": "Unknown tab"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"period": period.as_dict(), **handler()}, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------ overview
    def overview(self, issues, period, project_ids):
        previous = period.previous()
        length = len(period.buckets())

        def done_in(p):
            return issues.filter(state__group="completed", **p.contains("completed_at"))

        created, created_before = (
            issues.filter(**period.contains("created_at")),
            issues.filter(**previous.contains("created_at")),
        )
        done, done_before = done_in(period), done_in(previous)
        done_by_bots = done.filter(bot_assigned())
        open_now = issues.filter(state__group__in=OPEN_GROUPS)
        running = total_and_resolved(history_issues(project_ids), period)

        projects = (
            Project.objects.filter(id__in=project_ids)
            .annotate(
                done=Count(
                    "project_issue", filter=Q(project_issue__in=issues, project_issue__state__group="completed")
                ),
                open=Count(
                    "project_issue", filter=Q(project_issue__in=issues, project_issue__state__group__in=OPEN_GROUPS)
                ),
            )
            .values("id", "name", "identifier", "logo_props", "done", "open")
        )

        return {
            "tiles": {
                "created": {"value": created.count(), "previous": created_before.count()},
                "done": {"value": done.count(), "previous": done_before.count()},
                "median_days_to_done": {
                    "value": median_days(done.values_list("created_at", "completed_at")),
                    "previous": median_days(done_before.values_list("created_at", "completed_at")),
                },
                "open": {
                    "value": open_now.count(),
                    "projects": open_now.values("project_id").distinct().count(),
                },
            },
            "series": {
                "created": period.series(created.values_list("created_at", flat=True)),
                "done": period.series(done.values_list("completed_at", flat=True)),
                "done_people": period.series(done.exclude(bot_assigned()).values_list("completed_at", flat=True)),
                "done_bots": period.series(done_by_bots.values_list("completed_at", flat=True)),
                "previous_created": aligned(
                    previous.series(created_before.values_list("created_at", flat=True)), length
                ),
                "previous_done": aligned(previous.series(done_before.values_list("completed_at", flat=True)), length),
                # running totals at each bucket's end: every item so far, and those done or cancelled (D47)
                "total_running": running["total"],
                "resolved_running": running["resolved"],
            },
            "projects": sorted(
                ({**p, "id": str(p["id"])} for p in projects),
                key=lambda p: (-(p["done"] + p["open"]), p["name"]),
            ),
        }

    # ------------------------------------------------------------------ work items: the chart builder
    def work_items(self, issues, period, slug):
        measure = self.request.GET.get("measure", "created")
        if measure == "done":
            queryset = issues.filter(state__group="completed", **period.contains("completed_at"))
        else:
            queryset = issues.filter(**period.contains("created_at"))
        pql = self.request.GET.get("pql", "").strip()
        if pql:
            queryset = apply_pql(queryset, pql, PQLContext.for_request(self.request, slug))
        x_axis = self.request.GET.get("x_axis", "STATE_GROUPS")
        split_by = self.request.GET.get("split_by") or None
        chart = build_analytics_chart(queryset, x_axis, split_by)
        return {**chart, "total": queryset.count()}

    # ------------------------------------------------------------------ cycles
    def cycles(self, period, project_ids):
        start, end = period.bounds()
        now = timezone.now()
        in_cycle = Q(issue_cycle__deleted_at__isnull=True, issue_cycle__issue__deleted_at__isnull=True)
        cycles = (
            Cycle.objects.filter(
                project_id__in=project_ids,
                archived_at__isnull=True,
                start_date__isnull=False,
                end_date__isnull=False,
                start_date__lt=end,
                end_date__gte=start,
            )
            .annotate(
                total=Count("issue_cycle", filter=in_cycle),
                done=Count("issue_cycle", filter=in_cycle & Q(issue_cycle__issue__state__group="completed")),
                cancelled=Count("issue_cycle", filter=in_cycle & Q(issue_cycle__issue__state__group="cancelled")),
            )
            .values(
                "id",
                "name",
                "start_date",
                "end_date",
                "total",
                "done",
                "cancelled",
                "project_id",
                "project__identifier",
                "project__name",
            )
            .order_by("end_date")
        )

        rows = []
        for cycle in cycles:
            state = "completed" if cycle["end_date"] < now else "upcoming" if cycle["start_date"] > now else "current"
            rows.append(
                {
                    "id": str(cycle["id"]),
                    "name": cycle["name"],
                    "project": {
                        "id": str(cycle["project_id"]),
                        "identifier": cycle["project__identifier"],
                        "name": cycle["project__name"],
                    },
                    "start_date": cycle["start_date"].astimezone(period.tz).date().isoformat(),
                    "end_date": cycle["end_date"].astimezone(period.tz).date().isoformat(),
                    "status": state,
                    "total": cycle["total"],
                    "done": cycle["done"],
                    "cancelled": cycle["cancelled"],
                }
            )

        finished = [r for r in rows if r["status"] == "completed" and r["total"] - r["cancelled"] > 0]
        completion = (
            round(100 * sum(r["done"] for r in finished) / sum(r["total"] - r["cancelled"] for r in finished))
            if finished
            else None
        )
        return {
            "tiles": {
                "cycles": len(rows),
                "current": sum(1 for r in rows if r["status"] == "current"),
                "completion": completion,
                "items": sum(r["total"] for r in rows),
            },
            "cycles": rows,
        }

    # ------------------------------------------------------------------ modules
    def modules(self, issues, period, project_ids):
        today = timezone.now().astimezone(period.tz).date()
        in_module = Q(issue_module__deleted_at__isnull=True, issue_module__issue__in=issues)
        modules = (
            Module.objects.filter(project_id__in=project_ids, archived_at__isnull=True)
            .annotate(
                total=Count("issue_module", filter=in_module),
                done=Count("issue_module", filter=in_module & Q(issue_module__issue__state__group="completed")),
                open=Count("issue_module", filter=in_module & Q(issue_module__issue__state__group__in=OPEN_GROUPS)),
                done_in_period=Count(
                    "issue_module",
                    filter=in_module
                    & Q(issue_module__issue__state__group="completed")
                    & Q(**period.contains("issue_module__issue__completed_at")),
                ),
            )
            .select_related("lead", "project")
            .order_by("target_date", "name")
        )

        rows = []
        for module in modules:
            overdue = (
                module.target_date is not None
                and module.target_date < today
                and module.status not in ("completed", "cancelled")
            )
            rows.append(
                {
                    "id": str(module.id),
                    "name": module.name,
                    "project": {
                        "id": str(module.project_id),
                        "identifier": module.project.identifier,
                        "name": module.project.name,
                    },
                    "status": module.status,
                    "lead": {"id": str(module.lead_id), "name": member_name(module.lead)} if module.lead else None,
                    "start_date": module.start_date.isoformat() if module.start_date else None,
                    "target_date": module.target_date.isoformat() if module.target_date else None,
                    "overdue": overdue,
                    "total": module.total,
                    "done": module.done,
                    "open": module.open,
                    "done_in_period": module.done_in_period,
                }
            )

        return {
            "tiles": {
                "modules": len(rows),
                "in_progress": sum(1 for r in rows if r["status"] == "in-progress"),
                "overdue": sum(1 for r in rows if r["overdue"]),
                "done_in_period": sum(r["done_in_period"] for r in rows),
            },
            "modules": rows,
        }

    # ------------------------------------------------------------------ intake
    def intake(self, period, project_ids):
        previous = period.previous()
        received = IntakeIssue.objects.filter(project_id__in=project_ids, **period.contains("created_at"))
        received_before = IntakeIssue.objects.filter(project_id__in=project_ids, **previous.contains("created_at"))
        outcome = {"accepted": Q(status=1), "declined": Q(status=-1), "duplicate": Q(status=2)}

        series = {
            key: period.series(received.filter(q).values_list("created_at", flat=True)) for key, q in outcome.items()
        }
        series["pending"] = period.series(received.filter(status__in=(-2, 0)).values_list("created_at", flat=True))
        sources = received.values("source").annotate(count=Count("id")).order_by("-count")

        return {
            "tiles": {
                "received": {"value": received.count(), "previous": received_before.count()},
                "accepted": received.filter(outcome["accepted"]).count(),
                "declined": received.filter(outcome["declined"]).count(),
                "pending": IntakeIssue.objects.filter(project_id__in=project_ids, status=-2).count(),
            },
            "series": series,
            "sources": [{"source": s["source"] or "IN_APP", "count": s["count"]} for s in sources],
        }

    # ------------------------------------------------------------------ people and bots
    def people(self, issues, period):
        assigned = IssueAssignee.objects.filter(issue__in=issues, deleted_at__isnull=True)
        done = Q(issue__state__group="completed", **period.contains("issue__completed_at"))
        totals = (
            assigned.values("assignee_id")
            .order_by()
            .annotate(
                open=Count("issue_id", filter=Q(issue__state__group__in=OPEN_GROUPS), distinct=True),
                in_progress=Count("issue_id", filter=Q(issue__state__group="started"), distinct=True),
                done=Count("issue_id", filter=done, distinct=True),
            )
        )

        finished = defaultdict(list)
        for assignee_id, created_at, completed_at in assigned.filter(done).values_list(
            "assignee_id", "issue__created_at", "issue__completed_at"
        ):
            finished[assignee_id].append((created_at, completed_at))

        users = {
            u.id: u
            for u in User.objects.filter(id__in=[t["assignee_id"] for t in totals]).select_related("avatar_asset")
        }
        members = []
        for row in totals:
            user = users.get(row["assignee_id"])
            if user is None or not (row["open"] or row["done"]):
                continue
            pairs = finished.get(user.id, [])
            members.append(
                {
                    "id": str(user.id),
                    "name": member_name(user),
                    "avatar_url": user.avatar_url,
                    "is_bot": user.is_bot,
                    "open": row["open"],
                    "in_progress": row["in_progress"],
                    "done": row["done"],
                    "median_days_to_done": median_days(pairs),
                    "done_per_bucket": period.series(completed for _, completed in pairs),
                }
            )
        members.sort(key=lambda m: (-m["done"], -m["open"], m["name"].lower()))
        return {"members": members}
