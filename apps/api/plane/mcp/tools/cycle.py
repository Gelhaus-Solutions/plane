# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Cycles and modules: the same shape, a project's work items grouped by time or by feature."""

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from plane.mcp.tools import Tool, ToolError, api, integer, keep, paging, split_ids, text
from plane.mcp.tools.workitem import PQL_HELP

CYCLE_STATUSES = ("current", "upcoming", "completed", "draft", "incomplete")
CYCLE_FIELDS = (
    "name",
    "description",
    "start_date",
    "end_date",
    "owned_by",
    "timezone",
    "external_source",
    "external_id",
)
MODULE_FIELDS = (
    "name",
    "description",
    "start_date",
    "target_date",
    "status",
    "lead",
    "external_source",
    "external_id",
)
WORKITEM_QUERY = ("order_by", "expand", "fields")


def _project(ctx, args, suffix):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/{suffix}"


def _changes(args, fields):
    body = keep(args, fields)
    if not body:
        raise ToolError("Nothing to change: pass at least one field")
    return body


def _list_workitems(ctx, args, field, ident):
    """Through the work item list, so the caller's PQL, ordering and paging work as they do there."""
    pql = f'{field} = "{ident}"'
    if args.get("pql"):
        pql += f" AND ({args['pql']})"
    query = {**keep(args, WORKITEM_QUERY), **paging(args), "pql": pql}
    return api(ctx, "GET", _project(ctx, args, "work-items/"), query)


def _manage(ctx, args, path):
    add, remove = split_ids(args.get("add_ids")), split_ids(args.get("remove_ids"))
    if not add and not remove:
        raise ToolError("Pass add_ids or remove_ids")
    if add:
        api(ctx, "POST", path, body={"issues": add})
    for ident in remove:
        api(ctx, "DELETE", path + f"{ident}/")
    return {"added": add, "removed": remove}


def _delete(ctx, path, ident):
    api(ctx, "DELETE", path)
    return {"deleted": ident}


# -------------------------------------------------------------------- cycles


def _cycle(ctx, args, suffix=""):
    return _project(ctx, args, f"cycles/{args['cycle_id']}/{suffix}")


def list_cycles(ctx, args):
    query = {**paging(args), **keep(args, ("order_by",))}
    if args.get("archived"):
        return api(ctx, "GET", _project(ctx, args, "archived-cycles/"), query)
    status = args.get("status")
    if status and status not in CYCLE_STATUSES:
        raise ToolError(f"status must be one of: {', '.join(CYCLE_STATUSES)}")
    return api(ctx, "GET", _project(ctx, args, "cycles/"), {**query, "cycle_view": status})


def complete_cycle(ctx, args):
    """End the cycle now; a cycle that has already ended is returned as it is."""
    cycle = api(ctx, "GET", _cycle(ctx, args))
    now = timezone.now()
    end = parse_datetime(cycle["end_date"]) if cycle.get("end_date") else None
    if end is not None and end <= now:
        return cycle
    start = parse_datetime(cycle["start_date"]) if cycle.get("start_date") else None
    if start is not None and start > now:
        raise ToolError("This cycle has not started yet, so it cannot be completed")
    return api(ctx, "PATCH", _cycle(ctx, args), body={"end_date": now.isoformat()})


def archive_cycle(ctx, args):
    complete_cycle(ctx, args)  # Plane archives only cycles that have ended
    api(ctx, "POST", _cycle(ctx, args, "archive/"))
    return {"archived": args["cycle_id"]}


def unarchive_cycle(ctx, args):
    api(ctx, "DELETE", _project(ctx, args, f"archived-cycles/{args['cycle_id']}/unarchive/"))
    return {"unarchived": args["cycle_id"]}


def transfer(ctx, args):
    api(ctx, "POST", _cycle(ctx, args, "transfer-issues/"), body={"new_cycle_id": args["new_cycle_id"]})
    return {"transferred_to": args["new_cycle_id"]}


Tool(
    "cycle",
    f"""Cycles (time-boxed iterations) in a project.

Actions:
  list (project_id; optional archived, status, cursor, per_page, order_by);
  retrieve (project_id, cycle_id);
  create (project_id, name; optional owned_by, description, start_date, end_date, timezone, external_source,
      external_id) -- owned_by defaults to you; give both dates or neither;
  update (project_id, cycle_id; optional name, description, start_date, end_date, owned_by, timezone,
      external_source, external_id) -- only the fields you pass are changed; a cycle that has ended cannot be edited;
  delete (project_id, cycle_id);
  list_workitems (project_id, cycle_id; optional pql, order_by, cursor, per_page, expand, fields);
  manage_workitems (project_id, cycle_id; optional add_ids, remove_ids) -- pass at least one of add_ids or
      remove_ids, one id or several separated by commas; a work item sits in one cycle at a time, so adding moves it;
  transfer_workitems (project_id, cycle_id, new_cycle_id) -- moves only the unfinished work items to new_cycle_id;
      the source cycle must have ended first, so complete it before transferring or the call is rejected;
  complete (project_id, cycle_id) -- sets end_date to now;
  archive (project_id, cycle_id) -- ends the cycle first if it is still running;
  unarchive (project_id, cycle_id).

status filters active cycles: current, upcoming, completed, draft, incomplete; it is ignored when archived is true.
Dates are ISO 8601 (YYYY-MM-DD). owned_by is a member id. Cycles must be enabled for the project
(`project update_features`). pql: {PQL_HELP}""",
    {
        "add_ids": text(),
        "archived": {"default": False, "type": "boolean"},
        "cursor": text(),
        "cycle_id": text(),
        "description": text(),
        "end_date": text(),
        "expand": text(),
        "external_id": text(),
        "external_source": text(),
        "fields": text(),
        "name": text(),
        "new_cycle_id": text(),
        "order_by": text(),
        "owned_by": text(),
        "per_page": integer(),
        "pql": {**text(), "description": PQL_HELP},
        "project_id": text(),
        "remove_ids": text(),
        "start_date": text(),
        "status": text(),
        "timezone": text(),
    },
    {
        "list": (("project_id",), list_cycles),
        "retrieve": (("project_id", "cycle_id"), lambda ctx, a: api(ctx, "GET", _cycle(ctx, a))),
        "create": (
            ("project_id", "name"),
            lambda ctx, a: api(ctx, "POST", _project(ctx, a, "cycles/"), body=keep(a, CYCLE_FIELDS)),
        ),
        "update": (
            ("project_id", "cycle_id"),
            lambda ctx, a: api(ctx, "PATCH", _cycle(ctx, a), body=_changes(a, CYCLE_FIELDS)),
        ),
        "delete": (("project_id", "cycle_id"), lambda ctx, a: _delete(ctx, _cycle(ctx, a), a["cycle_id"])),
        "list_workitems": (
            ("project_id", "cycle_id"),
            lambda ctx, a: _list_workitems(ctx, a, "cycle", a["cycle_id"]),
        ),
        "manage_workitems": (
            ("project_id", "cycle_id"),
            lambda ctx, a: _manage(ctx, a, _cycle(ctx, a, "cycle-issues/")),
        ),
        "transfer_workitems": (("project_id", "cycle_id", "new_cycle_id"), transfer),
        "complete": (("project_id", "cycle_id"), complete_cycle),
        "archive": (("project_id", "cycle_id"), archive_cycle),
        "unarchive": (("project_id", "cycle_id"), unarchive_cycle),
    },
)


# ------------------------------------------------------------------- modules


def _module(ctx, args, suffix=""):
    return _project(ctx, args, f"modules/{args['module_id']}/{suffix}")


def _module_body(args, required=False):
    body = _changes(args, MODULE_FIELDS) if required and not args.get("members") else keep(args, MODULE_FIELDS)
    if args.get("members"):
        body["members"] = split_ids(args["members"])
    return body


def list_modules(ctx, args):
    query = {**paging(args), **keep(args, ("order_by",))}
    suffix = "archived-modules/" if args.get("archived") else "modules/"
    return api(ctx, "GET", _project(ctx, args, suffix), query)


def archive_module(ctx, args):
    api(ctx, "POST", _module(ctx, args, "archive/"))
    return {"archived": args["module_id"]}


def unarchive_module(ctx, args):
    api(ctx, "DELETE", _project(ctx, args, f"archived-modules/{args['module_id']}/unarchive/"))
    return {"unarchived": args["module_id"]}


Tool(
    "module",
    f"""Modules (feature groupings) in a project.

Actions:
  list (project_id; optional archived, cursor, per_page, order_by);
  retrieve (project_id, module_id);
  create (project_id, name; optional description, start_date, target_date, status, lead, members, external_source,
      external_id);
  update (project_id, module_id; optional name, description, start_date, target_date, status, lead, members,
      external_source, external_id) -- only the fields you pass are changed; members replaces the member list;
  delete (project_id, module_id);
  list_workitems (project_id, module_id; optional pql, order_by, cursor, per_page, expand, fields);
  manage_workitems (project_id, module_id; optional add_ids, remove_ids) -- pass at least one of add_ids or
      remove_ids, one id or several separated by commas;
  archive (project_id, module_id) -- only a completed or cancelled module can be archived;
  unarchive (project_id, module_id).

status is one of: backlog, planned, in-progress, paused, completed, cancelled. Dates are ISO 8601 (YYYY-MM-DD). lead
is a member id; members is one member id or several separated by commas. Modules must be enabled for the project
(`project update_features`). pql: {PQL_HELP}""",
    {
        "add_ids": text(),
        "archived": {"default": False, "type": "boolean"},
        "cursor": text(),
        "description": text(),
        "expand": text(),
        "external_id": text(),
        "external_source": text(),
        "fields": text(),
        "lead": text(),
        "members": text(),
        "module_id": text(),
        "name": text(),
        "order_by": text(),
        "per_page": integer(),
        "pql": {**text(), "description": PQL_HELP},
        "project_id": text(),
        "remove_ids": text(),
        "start_date": text(),
        "status": text(),
        "target_date": text(),
    },
    {
        "list": (("project_id",), list_modules),
        "retrieve": (("project_id", "module_id"), lambda ctx, a: api(ctx, "GET", _module(ctx, a))),
        "create": (
            ("project_id", "name"),
            lambda ctx, a: api(ctx, "POST", _project(ctx, a, "modules/"), body=_module_body(a)),
        ),
        "update": (
            ("project_id", "module_id"),
            lambda ctx, a: api(ctx, "PATCH", _module(ctx, a), body=_module_body(a, required=True)),
        ),
        "delete": (("project_id", "module_id"), lambda ctx, a: _delete(ctx, _module(ctx, a), a["module_id"])),
        "list_workitems": (
            ("project_id", "module_id"),
            lambda ctx, a: _list_workitems(ctx, a, "module", a["module_id"]),
        ),
        "manage_workitems": (
            ("project_id", "module_id"),
            lambda ctx, a: _manage(ctx, a, _module(ctx, a, "module-issues/")),
        ),
        "archive": (("project_id", "module_id"), archive_module),
        "unarchive": (("project_id", "module_id"), unarchive_module),
    },
)
