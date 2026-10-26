# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The numbers behind a dashboard's widgets (E23).

Every widget counts the work items of the viewer's projects, narrowed by the dashboard's projects and query and by
its own query (the two queries joined with AND), archived items included so finished work stays in the history.
Done means a completed state; resolved means done or cancelled (D47).

A widget's config, per chart (anything missing takes the first value):

- number: measure count (items matching now) | created | done | resolved (in the period, against the period before)
- line: measure count (per bucket) | running (a running total); x_axis created_resolved | created | done | resolved;
  split_by one of SPLITS when x_axis names one date
- bars: x_axis created | done | resolved; split_by; totals (the sum on each bar)
- rows, table: x_axis one of FIELDS (a row per value); split_by status (done, open, cancelled) or one of SPLITS
- list: sort oldest | newest | updated | due | priority
- every chart: legend, show_query
"""

import time
from collections import defaultdict

from django.db.models import Case, CharField, Count, F, FilteredRelation, Q, Value, When
from django.db.models.functions import Cast, Coalesce

from plane.db.models import IssueAssignee
from plane.utils.build_chart import bot_assigned
from plane.utils.pql.backend import PQLQueryError, apply_pql
from plane.utils.resolved import RESOLVED_GROUPS, history_issues, resolved_at, running

PERIOD_DAYS = {"2w": 14, "6w": 42, "quarter": 91}
# Three series at most; a fourth folds into Other
MAX_SERIES = 3
LIST_LIMIT = 25
PRIORITY_ORDER = ["urgent", "high", "medium", "low", "none"]


def _state_group_key():
    """A built-in state group by its key (review, completed), a workspace's own by its id, a bare state by category."""
    return Coalesce(F("state__state_group__key"), Cast("state__state_group_id", CharField()), F("state__group"))


# key: what a row or series is keyed by, its name, and the relation it reads through (left joined, live rows only)
FIELDS = {
    "project": (F("project_id"), F("project__name"), None),
    "state_group": (_state_group_key(), Coalesce(F("state__state_group__name"), F("state__group")), None),
    "state": (F("state_id"), F("state__name"), None),
    "priority": (F("priority"), F("priority"), None),
    "assignee": (F("live_assignee__assignee_id"), F("live_assignee__assignee__display_name"), "assignee"),
    "assignee_type": (None, None, None),
    "label": (F("live_label__label_id"), F("live_label__label__name"), "label"),
    "module": (F("live_module__module_id"), F("live_module__module__name"), "module"),
    "cycle": (F("live_cycle__cycle_id"), F("live_cycle__cycle__name"), "cycle"),
    "parent": (F("parent_id"), F("parent__name"), None),
    "created_by": (F("created_by_id"), F("created_by__display_name"), None),
}
SPLITS = ["state_group", "priority", "assignee_type", "project", "assignee", "label"]
RELATIONS = {
    "assignee": ("live_assignee", "issue_assignee"),
    "label": ("live_label", "label_issue"),
    "module": ("live_module", "issue_module"),
    "cycle": ("live_cycle", "issue_cycle"),
}

CHARTS = {
    "number": {"measure": ["count", "created", "done", "resolved"]},
    "line": {"measure": ["count", "running"], "x_axis": ["created_resolved", "created", "done", "resolved"]},
    "bars": {"x_axis": ["created", "done", "resolved"]},
    "rows": {"x_axis": list(FIELDS), "split_by": ["status", "", *SPLITS]},
    "table": {"x_axis": list(FIELDS), "split_by": ["status", "", *SPLITS]},
    "list": {"sort": ["oldest", "newest", "updated", "due", "priority"]},
}
SWITCHES = {"legend": True, "show_query": True, "totals": False}


def clean_config(chart, config):
    """The widget's config with every choice it does not know replaced by the chart's default."""
    config = config if isinstance(config, dict) else {}
    out = {}
    for key, choices in CHARTS.get(chart, {}).items():
        out[key] = config.get(key) if config.get(key) in choices else choices[0]
    if chart in ("line", "bars"):
        split = config.get("split_by") or ""
        out["split_by"] = split if split in SPLITS and out.get("x_axis") != "created_resolved" else ""
    for key, default in SWITCHES.items():
        out[key] = bool(config.get(key, default))
    return out


class Scope:
    """What every widget of one dashboard counts from, for one viewer."""

    def __init__(self, project_ids, pql, period, context):
        self.period = period
        self.context = context
        self.base = history_issues(project_ids)
        self.error = None
        if pql and pql.strip():
            try:
                self.base = apply_pql(self.base, pql, context)
            except PQLQueryError as error:
                self.error = error.detail["pql"]

    def items(self, pql):
        queryset = self.base
        if pql and pql.strip():
            queryset = apply_pql(queryset, pql, self.context)
        return queryset


def widget_data(scope, chart, pql, config):
    """One widget's numbers, with how many items its query matches and how long that took; a bad query gives its
    error instead."""
    started = time.monotonic()
    if scope.error:
        return {"error": {**scope.error, "source": "dashboard"}}
    try:
        items = scope.items(pql)
    except PQLQueryError as error:
        return {"error": error.detail["pql"]}
    config = clean_config(chart, config)
    builder = {
        "number": number,
        "line": line,
        "bars": bars,
        "rows": grouped,
        "table": grouped,
        "list": item_list,
    }[chart]
    data = builder(items, scope.period, config)
    return {**data, "matched": items.count(), "ms": round((time.monotonic() - started) * 1000)}


# ---------------------------------------------------------------------------- dates
def dated(items, axis):
    """The items an axis counts and the field holding their date."""
    if axis == "done":
        return items.filter(state__group="completed"), "completed_at"
    if axis == "resolved":
        return items.filter(state__group__in=RESOLVED_GROUPS).annotate(resolved=resolved_at()), "resolved"
    return items, "created_at"


def in_period(items, field, period):
    start, end = period.bounds()
    return items.filter(**{f"{field}__gte": start, f"{field}__lt": end})


def before_period(items, field, period):
    start, _ = period.bounds()
    return items.filter(**{f"{field}__lt": start})


# ---------------------------------------------------------------------------- fields
def with_field(items, field, prefix):
    """The items annotated with ``<prefix>_key`` and ``<prefix>_name`` for a field; an item counts once per value."""
    if field == "assignee_type":
        return items.annotate(
            **{
                f"{prefix}_key": Case(When(bot_assigned(), then=Value("bots")), default=Value("people")),
                f"{prefix}_name": Value(""),
            }
        )
    if field == "status":
        status = Case(
            When(state__group="completed", then=Value("done")),
            When(state__group="cancelled", then=Value("cancelled")),
            default=Value("open"),
        )
        return items.annotate(**{f"{prefix}_key": status, f"{prefix}_name": Value("")})
    key, name, relation = FIELDS[field]
    if relation:
        alias, path = RELATIONS[relation]
        if alias not in items.query.annotations:
            items = items.annotate(
                **{alias: FilteredRelation(path, condition=Q(**{f"{path}__deleted_at__isnull": True}))}
            )
    return items.annotate(**{f"{prefix}_key": Cast(key, CharField()), f"{prefix}_name": name})


# Splits with a fixed set of values keep their order, so people stay first and done before open
FIXED_ORDER = {"assignee_type": ["people", "bots"], "status": ["done", "open", "cancelled"]}


def fold(series, split=""):
    """The three biggest series by their total, the rest summed into Other."""
    series = sorted(series, key=lambda s: -sum(s["values"]))
    if len(series) > MAX_SERIES:
        kept, rest = series[: MAX_SERIES - 1], series[MAX_SERIES - 1 :]
        other = [sum(values) for values in zip(*(s["values"] for s in rest))]
        series = [*kept, {"key": "other", "name": "", "values": other}]
    order = FIXED_ORDER.get(split)
    if order:
        series.sort(key=lambda s: order.index(s["key"]) if s["key"] in order else len(order))
    return series


# ---------------------------------------------------------------------------- charts
def number(items, period, config):
    measure = config["measure"]
    if measure == "count":
        return {"value": items.count(), "previous": None, "trend": None}
    counted, field = dated(items, measure)
    previous = period.previous()
    inside = in_period(counted, field, period)
    return {
        "value": inside.count(),
        "previous": in_period(counted, field, previous).count(),
        "trend": period.series(inside.values_list(field, flat=True)),
    }


def time_series(items, axis, period, split, cumulative):
    counted, field = dated(items, axis)
    inside = in_period(counted, field, period)
    if not split:
        values = period.series(inside.values_list(field, flat=True))
        if cumulative:
            values = running(values, before_period(counted, field, period).count())
        return [{"key": axis, "name": "", "values": values}]

    moments, names = defaultdict(list), {}
    for moment, key, name in with_field(inside, split, "split").values_list(field, "split_key", "split_name"):
        moments[key or "none"].append(moment)
        names[key or "none"] = name or ""
    before = {}
    if cumulative:
        rows = (
            with_field(before_period(counted, field, period), split, "split")
            .values("split_key", "split_name")
            .annotate(n=Count("id"))
            .order_by()
        )
        for row in rows:
            key = row["split_key"] or "none"
            before[key] = before.get(key, 0) + row["n"]
            names.setdefault(key, row["split_name"] or "")
    series = []
    for key in set(moments) | set(before):
        values = period.series(moments.get(key, []))
        series.append(
            {
                "key": key,
                "name": names.get(key, ""),
                "values": running(values, before.get(key, 0)) if cumulative else values,
            }
        )
    return fold(series, split)


def line(items, period, config):
    cumulative = config["measure"] == "running"
    if config["x_axis"] == "created_resolved":
        created = time_series(items, "created", period, "", cumulative)[0]
        resolved = time_series(items, "resolved", period, "", cumulative)[0]
        series = [
            {**resolved, "key": "resolved"},
            {**created, "key": "total" if cumulative else "created"},
        ]
    else:
        series = time_series(items, config["x_axis"], period, config["split_by"], cumulative)
    return {"period": period.as_dict(), "series": series}


def bars(items, period, config):
    return {
        "period": period.as_dict(),
        "series": time_series(items, config["x_axis"], period, config["split_by"], False),
    }


def grouped(items, period, config):
    """A row per value of x_axis, each counted per value of split_by."""
    rows_by, split = config["x_axis"], config["split_by"]
    queryset = with_field(items, rows_by, "row")
    values = ["row_key", "row_name"]
    if split:
        queryset = with_field(queryset, split, "split")
        values += ["split_key", "split_name"]
    counts = queryset.values(*values).annotate(n=Count("id", distinct=True)).order_by()

    rows, split_names, split_totals = {}, {}, defaultdict(int)
    for entry in counts:
        key = entry["row_key"] or "none"
        row = rows.setdefault(key, {"key": key, "name": entry["row_name"] or "", "counts": defaultdict(int)})
        split_key = (entry.get("split_key") or "none") if split else "count"
        row["counts"][split_key] += entry["n"]
        split_names[split_key] = (entry.get("split_name") or "") if split else ""
        split_totals[split_key] += entry["n"]

    order = sorted(split_totals, key=lambda k: -split_totals[k])
    if split == "status":
        order = [k for k in ("done", "open", "cancelled") if k in split_totals]
    if len(order) > MAX_SERIES:
        order = [*order[: MAX_SERIES - 1], "other"]
    series = [{"key": k, "name": split_names.get(k, "")} for k in order]

    out = []
    for row in rows.values():
        values = [row["counts"].get(k, 0) for k in order]
        if order and order[-1] == "other":
            values[-1] = sum(n for k, n in row["counts"].items() if k not in order[:-1])
        out.append({"key": row["key"], "name": row["name"], "values": values, "total": sum(row["counts"].values())})
    if rows_by == "priority":
        out.sort(key=lambda r: PRIORITY_ORDER.index(r["key"]) if r["key"] in PRIORITY_ORDER else 9)
    else:
        out.sort(key=lambda r: (-r["total"], r["name"].lower()))
    return {"series": series, "rows": out}


def item_list(items, period, config):
    order = {
        "oldest": ("created_at",),
        "newest": ("-created_at",),
        "updated": ("-updated_at",),
        "due": (F("target_date").asc(nulls_last=True), "created_at"),
        "priority": (
            Case(*(When(priority=p, then=Value(i)) for i, p in enumerate(PRIORITY_ORDER)), default=Value(9)),
            "created_at",
        ),
    }[config["sort"]]
    rows = list(
        items.order_by(*order)[:LIST_LIMIT].values(
            "id",
            "name",
            "sequence_id",
            "priority",
            "project_id",
            "project__identifier",
            "state__name",
            "state__color",
            "state__group",
            "created_at",
            "updated_at",
            "target_date",
        )
    )
    assignees = defaultdict(list)
    for issue_id, user_id in IssueAssignee.objects.filter(
        issue_id__in=[r["id"] for r in rows], deleted_at__isnull=True
    ).values_list("issue_id", "assignee_id"):
        assignees[issue_id].append(str(user_id))
    return {
        "items": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "key": f"{r['project__identifier']}-{r['sequence_id']}",
                "project_id": str(r["project_id"]),
                "priority": r["priority"],
                "state": {"name": r["state__name"], "color": r["state__color"], "group": r["state__group"]},
                "assignee_ids": assignees.get(r["id"], []),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "target_date": r["target_date"],
            }
            for r in rows
        ]
    }
