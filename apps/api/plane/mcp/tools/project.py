# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.mcp.tools import Tool, ToolError, api, integer, optional, text

# Feature toggle -> the project field that holds it; toggles this Plane does not have map to None
FEATURES = {
    "modules": "module_view",
    "cycles": "cycle_view",
    "views": "issue_views_view",
    "pages": "page_view",
    "intakes": "intake_view",
    "workitem_types": None,
    "epics": "epic_view",
    "parallel_cycles": None,
    "project_updates": None,
    "workflows": None,
}
TEXT_FIELDS = (
    "name",
    "identifier",
    "description",
    "description_html",
    "project_lead",
    "default_assignee",
    "emoji",
    "cover_image",
    "timezone",
    "default_state",
    "estimate",
    "external_source",
    "external_id",
)
NUMBER_FIELDS = ("archive_in", "close_in", "network", "is_time_tracking_enabled")


def _body(args):
    body = {name: args[name] for name in TEXT_FIELDS if args.get(name)}
    body.update({name: args[name] for name in NUMBER_FIELDS if name in args and args[name] is not None})
    return body


def _path(ctx, args, suffix=""):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/{suffix}"


def list_projects(ctx, args):
    query = {name: args.get(name) for name in ("cursor", "per_page", "order_by")}
    return api(ctx, "GET", f"workspaces/{ctx.slug}/projects/", query)


def retrieve(ctx, args):
    return api(ctx, "GET", _path(ctx, args))


def create(ctx, args):
    return api(ctx, "POST", f"workspaces/{ctx.slug}/projects/", body=_body(args))


def update(ctx, args):
    body = _body(args)
    if not body:
        raise ToolError("Nothing to change: pass at least one field")
    return api(ctx, "PATCH", _path(ctx, args), body=body)


def delete(ctx, args):
    api(ctx, "DELETE", _path(ctx, args))
    return {"deleted": args["project_id"]}


def archive(ctx, args):
    api(ctx, "POST", _path(ctx, args, "archive/"))
    return {"archived": args["project_id"]}


def unarchive(ctx, args):
    api(ctx, "DELETE", _path(ctx, args, "archive/"))
    return {"unarchived": args["project_id"]}


def get_features(ctx, args):
    project = api(ctx, "GET", _path(ctx, args))
    return {name: bool(project.get(field)) if field else False for name, field in FEATURES.items()}


def update_features(ctx, args):
    body = {}
    for name, field in FEATURES.items():
        value = args.get(name)
        if value is None:
            continue
        if field is None:
            if value:
                raise ToolError(f"{name} is not available on this Plane yet")
            continue
        body[field] = value
    if not body:
        raise ToolError("Pass at least one feature toggle")
    api(ctx, "PATCH", _path(ctx, args), body=body)
    return get_features(ctx, args)


DESCRIPTION = """Projects in the workspace.

Actions:
  list (optional cursor, per_page, order_by);
  retrieve (project_id);
  create (name, identifier; optional description, project_lead, default_assignee, emoji, cover_image, timezone,
      archive_in, close_in, external_source, external_id);
  update (project_id; the fields to change, including network, default_state, estimate, is_time_tracking_enabled);
  delete (project_id);
  archive (project_id); unarchive (project_id);
  worklog_summary -- not available on this Plane yet;
  get_features (project_id) -- modules, cycles, views, pages, intakes and epics, plus the toggles this Plane does not
      have (always false);
  update_features (project_id; any of modules, cycles, views, pages, intakes, epics as booleans).

identifier is the work item prefix, such as ENG. network is 0 for secret, 2 for public. project_lead and
default_assignee are member ids from `member list_workspace`."""

Tool(
    "project",
    DESCRIPTION,
    {
        "archive_in": integer(),
        "close_in": integer(),
        "cover_image": text(),
        "cursor": text(),
        "cycles": optional("boolean"),
        "default_assignee": text(),
        "default_state": text(),
        "description": text(),
        "description_html": text(),
        "emoji": text(),
        "epics": optional("boolean"),
        "estimate": text(),
        "external_id": text(),
        "external_source": text(),
        "identifier": text(),
        "intakes": optional("boolean"),
        "is_time_tracking_enabled": optional("boolean"),
        "modules": optional("boolean"),
        "name": text(),
        "network": optional("integer"),
        "order_by": text(),
        "pages": optional("boolean"),
        "parallel_cycles": optional("boolean"),
        "per_page": integer(),
        "project_id": text(),
        "project_lead": text(),
        "project_updates": optional("boolean"),
        "timezone": text(),
        "views": optional("boolean"),
        "workflows": optional("boolean"),
        "workitem_types": optional("boolean"),
    },
    {
        "list": ((), list_projects),
        "retrieve": (("project_id",), retrieve),
        "create": (("name", "identifier"), create),
        "update": (("project_id",), update),
        "delete": (("project_id",), delete),
        "archive": (("project_id",), archive),
        "unarchive": (("project_id",), unarchive),
        "worklog_summary": (("project_id",), None),
        "get_features": (("project_id",), get_features),
        "update_features": (("project_id",), update_features),
    },
)
