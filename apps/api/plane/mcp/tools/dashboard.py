# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dashboards (E23): a chart's numbers over PQL with or without a dashboard, and dashboards built from widgets."""

from plane.mcp.tools import Tool, ToolError, api, integer, keep, split_ids, text

DASHBOARD_FIELDS = ("name", "description", "access", "period", "pql")
CONFIG_FIELDS = ("measure", "x_axis", "split_by", "sort")


def _dashboards(ctx, suffix=""):
    return f"workspaces/{ctx.slug}/dashboards/{suffix}"


def _config(args):
    return keep(args, CONFIG_FIELDS)


def _projects(args):
    return split_ids(args.get("project_ids")) if args.get("project_ids") else None


def list_dashboards(ctx, args):
    query = {"project": args["project_id"]} if args.get("project_id") else None
    return api(ctx, "GET", _dashboards(ctx), query)


def retrieve(ctx, args):
    return api(ctx, "GET", _dashboards(ctx, f"{args['dashboard_id']}/"))


def data(ctx, args):
    query = keep(args, ("period", "pql"))
    projects = _projects(args)
    if projects is not None:
        query["project_ids"] = ",".join(projects)
    if args.get("project_id"):
        query["project"] = args["project_id"]
    return api(ctx, "GET", _dashboards(ctx, f"{args['dashboard_id']}/data/"), query)


def chart(ctx, args):
    body = {"chart": args["chart"], "pql": args.get("pql", ""), "config": _config(args)}
    body.update(keep(args, ("period",)))
    projects = _projects(args)
    if projects:
        body["project_ids"] = projects
    return api(ctx, "POST", _dashboards(ctx, "chart/"), body=body)


def create(ctx, args):
    body = keep(args, DASHBOARD_FIELDS)
    projects = _projects(args)
    if projects is not None:
        body["project_ids"] = projects
    return api(ctx, "POST", _dashboards(ctx), body=body)


def update(ctx, args):
    body = keep(args, DASHBOARD_FIELDS)
    projects = _projects(args)
    if projects is not None:
        body["project_ids"] = projects
    if not body:
        raise ToolError("Nothing to change: pass name, description, access, period, project_ids or pql")
    return api(ctx, "PATCH", _dashboards(ctx, f"{args['dashboard_id']}/"), body=body)


def delete(ctx, args):
    api(ctx, "DELETE", _dashboards(ctx, f"{args['dashboard_id']}/"))
    return {"deleted": args["dashboard_id"]}


def duplicate(ctx, args):
    return api(ctx, "POST", _dashboards(ctx, f"{args['dashboard_id']}/duplicate/"), body=keep(args, ("name",)))


def _widget_body(args):
    # width and height 0 are the schema's defaults and mean "leave it"
    body = {key: value for key, value in keep(args, ("title", "chart", "pql", "width", "height")).items() if value != 0}
    config = _config(args)
    if config:
        body["config"] = config
    return body


def add_widget(ctx, args):
    return api(ctx, "POST", _dashboards(ctx, f"{args['dashboard_id']}/widgets/"), body=_widget_body(args))


def update_widget(ctx, args):
    body = _widget_body(args)
    if not body:
        raise ToolError("Nothing to change: pass title, chart, pql, a setting, width or height")
    path = _dashboards(ctx, f"{args['dashboard_id']}/widgets/{args['widget_id']}/")
    return api(ctx, "PATCH", path, body=body)


def delete_widget(ctx, args):
    api(ctx, "DELETE", _dashboards(ctx, f"{args['dashboard_id']}/widgets/{args['widget_id']}/"))
    return {"deleted": args["widget_id"]}


Tool(
    "dashboard",
    """Dashboards and charts over PQL: counts now, counts over time, running totals, and dashboards built from them.

Actions:
  chart (chart; optional pql, measure, x_axis, split_by, sort, period, project_ids) -- one chart's numbers without a
      dashboard: the quickest way to answer "how much work was created and resolved over time";
  list (optional project_id) -- the dashboards you can open: shared ones and your own private ones; with project_id,
      the ones that count that project (its projects include it, or it has none);
  retrieve (dashboard_id) -- a dashboard with its widgets;
  data (dashboard_id; optional period, project_ids, project_id, pql) -- every widget's numbers; period, project_ids
      and pql try other values than the dashboard's without saving them; project_id counts that one project alone,
      as the dashboard does opened from the project, and is refused when the dashboard does not count it;
  create (name; optional description, access, period, project_ids, pql);
  update (dashboard_id; optional name, description, access, period, project_ids, pql);
  duplicate (dashboard_id; optional name) -- a private copy for you;
  delete (dashboard_id);
  add_widget (dashboard_id, title, chart; optional pql, measure, x_axis, split_by, sort, width, height);
  update_widget (dashboard_id, widget_id; the fields to change);
  delete_widget (dashboard_id, widget_id).

chart is number, line, bars (stacked bars over time), rows (bars by row), list or table. Its settings:
  number: measure count (items matching now) | created | done | resolved (in the period, with the period before);
  line: measure count (per day or week) | running (a running total); x_axis created_resolved | created | done |
      resolved; split_by (not with created_resolved). Total and resolved work over time is line, measure running,
      x_axis created_resolved;
  bars: x_axis created | done | resolved; split_by;
  rows, table: x_axis (the rows) project | state_group | state | priority | assignee | assignee_type | label |
      module | cycle | parent | created_by; split_by status (done, open, cancelled) or a split field;
  list: sort oldest | newest | updated | due | priority.
split_by is one of state_group, priority, assignee_type (people or bots), project, assignee, label; three series at
most, the rest folded into Other. Resolved means done or cancelled. period is 2w (per day), 6w or quarter (per week);
project_ids narrows to some of your projects (ids separated by commas). A dashboard's pql joins every widget's pql
with AND. access is private or workspace; a workspace dashboard is edited by its owner and workspace admins. Widths
are columns of twelve, heights rows of 40 px.""",
    {
        "access": text(),
        "chart": text(),
        "dashboard_id": text(),
        "description": text(),
        "height": integer(),
        "measure": text(),
        "name": text(),
        "period": text(),
        "pql": text(),
        "project_id": text(),
        "project_ids": text(),
        "sort": text(),
        "split_by": text(),
        "title": text(),
        "widget_id": text(),
        "width": integer(),
        "x_axis": text(),
    },
    {
        "chart": (["chart"], chart),
        "list": ([], list_dashboards),
        "retrieve": (["dashboard_id"], retrieve),
        "data": (["dashboard_id"], data),
        "create": (["name"], create),
        "update": (["dashboard_id"], update),
        "duplicate": (["dashboard_id"], duplicate),
        "delete": (["dashboard_id"], delete),
        "add_widget": (["dashboard_id", "title", "chart"], add_widget),
        "update_widget": (["dashboard_id", "widget_id"], update_widget),
        "delete_widget": (["dashboard_id", "widget_id"], delete_widget),
    },
)
