# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import html
import re

from plane.mcp.tools import Tool, ToolError, api, integer, keep, number, optional, split_ids, string_list, text

PQL_HELP = (
    'Optional PQL filter, for example `priority = "urgent" AND assignee = currentUser()` or '
    "`stateGroup IN openStates() AND isOverdue()`. Ids (project, assignee, state, label, cycle, module) are UUIDs; "
    'a work item can be named by its key, as in `id = "WEB-11"`. Call `get_pql_reference` for the full syntax.'
)

LIST_QUERY = ("pql", "order_by", "per_page", "cursor", "expand", "fields", "external_id", "external_source")
WRITABLE = (
    "name",
    "type_id",
    "point",
    "description_html",
    "priority",
    "sort_order",
    "is_draft",
    "parent",
    "state",
    "estimate_point",
    "external_source",
    "external_id",
)


def _items(ctx, args):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/work-items/"


def _body(args):
    body = keep(args, WRITABLE)
    if "description_html" not in body and args.get("description_stripped"):
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", args["description_stripped"]) if p.strip()]
        body["description_html"] = "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs) or "<p></p>"
    for name in ("assignees", "labels"):
        if args.get(name) is not None:
            body[name] = args[name]
    for name in ("start_date", "target_date"):
        if name in args and args[name] != "":
            body[name] = args[name]  # None clears the date
    return body


def list_items(ctx, args):
    query = keep(args, LIST_QUERY)
    if args.get("project_id"):
        return api(ctx, "GET", _items(ctx, args), query)
    return api(ctx, "GET", f"workspaces/{ctx.slug}/work-items/", query)


def list_archived(ctx, args):
    path = f"workspaces/{ctx.slug}/projects/{args['project_id']}/archived-work-items/"
    return api(ctx, "GET", path, keep(args, LIST_QUERY))


def retrieve(ctx, args):
    return api(ctx, "GET", _items(ctx, args) + f"{args['workitem_id']}/", keep(args, ("expand", "fields")))


def retrieve_by_identifier(ctx, args):
    key = args["workitem_identifier"].strip().upper()
    match = re.fullmatch(r"([A-Z0-9]+)-(\d+)", key)
    if not match:
        raise ToolError("workitem_identifier is a project key and a number, such as ENG-42")
    path = f"workspaces/{ctx.slug}/work-items/{match.group(1)}-{match.group(2)}/"
    return api(ctx, "GET", path, keep(args, ("expand", "fields")))


def search(ctx, args):
    query = {"search": args["query"], "workspace_search": True, "limit": 25}
    return api(ctx, "GET", f"workspaces/{ctx.slug}/work-items/search/", query)


def count(ctx, args):
    query = keep(args, ("project_id", "pql", "group_by", "sub_group_by"))
    return api(ctx, "GET", f"workspaces/{ctx.slug}/work-items/count/", query)


def create(ctx, args):
    return api(ctx, "POST", _items(ctx, args), body=_body(args))


def update(ctx, args):
    body = _body(args)
    if not body:
        raise ToolError("Nothing to change: pass at least one field")
    return api(ctx, "PATCH", _items(ctx, args) + f"{args['workitem_id']}/", body=body)


def delete(ctx, args):
    api(ctx, "DELETE", _items(ctx, args) + f"{args['workitem_id']}/")
    return {"deleted": args["workitem_id"]}


def _merge(ctx, args, field, add, remove):
    path = _items(ctx, args) + f"{args['workitem_id']}/"
    current = api(ctx, "GET", path).get(field) or []
    current = [item["id"] if isinstance(item, dict) else str(item) for item in current]
    removed = set(split_ids(args.get(remove)))
    merged = [item for item in current if item not in removed]
    merged += [item for item in split_ids(args.get(add)) if item not in merged]
    if not args.get(add) and not args.get(remove):
        raise ToolError(f"Pass {add} or {remove}")
    return api(ctx, "PATCH", path, body={field: merged})


def manage_assignee(ctx, args):
    return _merge(ctx, args, "assignees", "add_user_id", "remove_user_id")


def manage_label(ctx, args):
    return _merge(ctx, args, "labels", "add_label_id", "remove_label_id")


DESCRIPTION = """Work items.

Actions:
  list (optional project_id, pql, order_by, per_page, cursor, expand, fields, external_id, external_source) -- without
      project_id it lists every project you belong to;
  list_archived (project_id; optional as list);
  retrieve (project_id, workitem_id; optional expand, fields);
  retrieve_by_identifier (workitem_identifier, such as ENG-42; optional expand, fields);
  search (query) -- matches title and key across the workspace;
  count (optional project_id, pql, group_by, sub_group_by);
  create (project_id, name; optional assignees, labels, type_id, point, description_html, description_stripped,
      priority, start_date, target_date, sort_order, is_draft, parent, state, estimate_point, external_source,
      external_id);
  update (project_id, workitem_id; the fields to change);
  delete (project_id, workitem_id);
  archive -- not available on this Plane yet;
  manage_assignee (project_id, workitem_id; add_user_id and/or remove_user_id, one id or several separated by commas);
  manage_label (project_id, workitem_id; add_label_id and/or remove_label_id, likewise).

priority is urgent, high, medium, low or none. assignees, labels, state, parent and type_id take UUIDs.
description_html is stored as given: send real HTML such as <p>text</p>, never escaped text such as &lt;p&gt;.
description_stripped is plain text, wrapped into paragraphs; description_html wins if both are given.
On update an empty string leaves a field alone; assignees=[] or labels=[] clear the list; start_date=null or
target_date=null clear the date.
A create with external_source and external_id answers 409 with the existing item's id if that pair already exists.
count groups by state_id, state__group, priority, project_id, type_id, labels__id, assignees__id,
    issue_module__module_id, cycle_id, created_by, target_date or start_date."""

Tool(
    "workitem",
    DESCRIPTION,
    {
        "add_label_id": text(),
        "add_user_id": text(),
        "archive": optional("boolean"),
        "assignees": string_list(),
        "cursor": text(),
        "description_html": text(),
        "description_stripped": text(),
        "estimate_point": text(),
        "expand": text(),
        "external_id": text(),
        "external_source": text(),
        "fields": text(),
        "group_by": text(),
        "is_draft": optional("boolean"),
        "labels": string_list(),
        "name": text(),
        "order_by": text(),
        "parent": text(),
        "per_page": integer(),
        "point": integer(),
        "pql": {**text(), "description": PQL_HELP},
        "priority": text(),
        "project_id": text(),
        "query": text(),
        "remove_label_id": text(),
        "remove_user_id": text(),
        "sort_order": number(),
        "start_date": optional("string", ""),
        "state": text(),
        "sub_group_by": text(),
        "target_date": optional("string", ""),
        "type_id": text(),
        "workitem_id": text(),
        "workitem_identifier": text(),
    },
    {
        "list": ((), list_items),
        "list_archived": (("project_id",), list_archived),
        "retrieve": (("project_id", "workitem_id"), retrieve),
        "retrieve_by_identifier": (("workitem_identifier",), retrieve_by_identifier),
        "search": (("query",), search),
        "count": ((), count),
        "create": (("project_id", "name"), create),
        "update": (("project_id", "workitem_id"), update),
        "delete": (("project_id", "workitem_id"), delete),
        "archive": (("project_id", "workitem_id"), None),
        "manage_assignee": (("project_id", "workitem_id"), manage_assignee),
        "manage_label": (("project_id", "workitem_id"), manage_label),
    },
)
