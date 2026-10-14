# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""States, labels, members, the workspace, and the PQL reference."""

import pathlib

from plane.mcp.tools import Tool, ToolError, api, integer, keep, optional, text

ROLES = {
    "workspace": [
        {"slug": "admin", "name": "Admin", "role": 20},
        {"slug": "member", "name": "Member", "role": 15},
        {"slug": "guest", "name": "Guest", "role": 5},
    ],
    "project": [
        {"slug": "admin", "name": "Admin", "role": 20},
        {"slug": "member", "name": "Member", "role": 15},
        {"slug": "guest", "name": "Guest", "role": 5},
    ],
}
PQL_README = pathlib.Path(__file__).resolve().parents[2] / "utils" / "pql" / "README.md"


def _delete(ctx, path, ident):
    api(ctx, "DELETE", path)
    return {"deleted": ident}


# ------------------------------------------------------------------- states


def _states(ctx, args, suffix=""):
    if not args.get("project_id"):
        raise ToolError("States belong to a project on this Plane: pass project_id")
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/states/{suffix}"


STATE_FIELDS = ("name", "color", "description", "sequence", "group", "default", "external_source", "external_id")
CATEGORIES = ("backlog", "unstarted", "started", "completed", "cancelled")


def _state_body(ctx, args):
    """group takes a category or the name of one of the workspace's state groups, such as Review."""
    body = keep(args, STATE_FIELDS)
    group = body.get("group")
    if group and group.lower() not in CATEGORIES:
        groups = api(ctx, "GET", f"workspaces/{ctx.slug}/state-groups/")
        match = next((g for g in groups if group.lower() in (g["name"].lower(), (g["key"] or "").lower())), None)
        if match is None:
            names = ", ".join(g["name"] for g in groups)
            raise ToolError(f"No state group named {group}; this workspace has: {names}")
        body.pop("group")
        body["state_group"] = match["id"]
    return body


Tool(
    "state",
    """Workflow states of a project.

Actions: list (project_id); retrieve (project_id, state_id); create (project_id, name, color; optional description,
    sequence, group, default, external_source, external_id); update (project_id, state_id; the fields to change);
    delete (project_id, state_id).

group is a category (backlog, unstarted, started, completed, cancelled) or the name of one of the workspace's state
groups, such as Review; `state_group list` shows them. color is a hex code such as #EF4444. States belong to a project
on this Plane, so project_id is always needed.""",
    {
        "color": text(),
        "cursor": text(),
        "default": optional("boolean"),
        "description": text(),
        "external_id": text(),
        "external_source": text(),
        "group": text(),
        "name": text(),
        "per_page": integer(),
        "project_id": text(),
        "sequence": optional("number"),
        "state_id": text(),
    },
    {
        "list": ((), lambda ctx, a: api(ctx, "GET", _states(ctx, a), keep(a, ("cursor", "per_page")))),
        "retrieve": (("state_id",), lambda ctx, a: api(ctx, "GET", _states(ctx, a, f"{a['state_id']}/"))),
        "create": (("name", "color"), lambda ctx, a: api(ctx, "POST", _states(ctx, a), body=_state_body(ctx, a))),
        "update": (
            ("state_id",),
            lambda ctx, a: api(ctx, "PATCH", _states(ctx, a, f"{a['state_id']}/"), body=_state_body(ctx, a)),
        ),
        "delete": (
            ("state_id",),
            lambda ctx, a: _delete(ctx, _states(ctx, a, f"{a['state_id']}/"), a["state_id"]),
        ),
    },
)

# ------------------------------------------------------------------- labels


def _labels(ctx, args, suffix=""):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/labels/{suffix}"


LABEL_FIELDS = ("name", "color", "description", "parent", "sort_order", "external_source", "external_id")

# -------------------------------------------------------------- state groups

GROUP_FIELDS = ("name", "category", "color", "description", "sequence")


def _groups(ctx, suffix=""):
    return f"workspaces/{ctx.slug}/state-groups/{suffix}"


Tool(
    "state_group",
    """State groups of the workspace: the columns states are grouped in.

Actions: list; retrieve (state_group_id); create (name, category; optional color, description, sequence);
    update (state_group_id; the fields to change); delete (state_group_id).

Each group sits in a category (backlog, unstarted, started, completed, cancelled), which drives progress, cycles and
archiving: a state in a custom "Waiting" group in the started category counts as started. Built-in groups (one per
category, plus Review in started) can be renamed and recoloured but keep their category and cannot be deleted. A group
with states in it cannot be deleted. Creating, changing and deleting groups needs a workspace admin. Move a state into
a group with `state update` and group=<the group's name>.""",
    {
        "category": text(),
        "color": text(),
        "description": text(),
        "name": text(),
        "sequence": optional("number"),
        "state_group_id": text(),
    },
    {
        "list": ((), lambda ctx, a: api(ctx, "GET", _groups(ctx))),
        "retrieve": (("state_group_id",), lambda ctx, a: api(ctx, "GET", _groups(ctx, f"{a['state_group_id']}/"))),
        "create": (("name", "category"), lambda ctx, a: api(ctx, "POST", _groups(ctx), body=keep(a, GROUP_FIELDS))),
        "update": (
            ("state_group_id",),
            lambda ctx, a: api(ctx, "PATCH", _groups(ctx, f"{a['state_group_id']}/"), body=keep(a, GROUP_FIELDS)),
        ),
        "delete": (
            ("state_group_id",),
            lambda ctx, a: _delete(ctx, _groups(ctx, f"{a['state_group_id']}/"), a["state_group_id"]),
        ),
    },
)


# ---------------------------------------------------------------- priorities

PRIORITY_FIELDS = ("name", "level", "color", "icon", "description", "sequence")


def _priorities(ctx, suffix=""):
    return f"workspaces/{ctx.slug}/priorities/{suffix}"


Tool(
    "priority",
    """Priorities of the workspace.

Actions: list; retrieve (priority_id); create (name, level; optional color, icon, description, sequence);
    update (priority_id; the fields to change); delete (priority_id).

Each priority sits at a level (urgent, high, medium, low, none), which sorting, PQL and analytics use: a custom
"Blocker" at the urgent level counts as urgent, and `priority = "urgent"` finds it while `priority = "Blocker"` finds
only Blocker items. Set one on a work item with `workitem update` and priority=<its name>. Built-in priorities (one per
level) can be renamed and recoloured but keep their level and cannot be deleted. Deleting a custom priority returns
its work items to their level's built-in one. Creating, changing and deleting priorities needs a workspace admin.""",
    {
        "color": text(),
        "description": text(),
        "icon": text(),
        "level": text(),
        "name": text(),
        "priority_id": text(),
        "sequence": optional("number"),
    },
    {
        "list": ((), lambda ctx, a: api(ctx, "GET", _priorities(ctx))),
        "retrieve": (("priority_id",), lambda ctx, a: api(ctx, "GET", _priorities(ctx, f"{a['priority_id']}/"))),
        "create": (("name", "level"), lambda ctx, a: api(ctx, "POST", _priorities(ctx), body=keep(a, PRIORITY_FIELDS))),
        "update": (
            ("priority_id",),
            lambda ctx, a: api(ctx, "PATCH", _priorities(ctx, f"{a['priority_id']}/"), body=keep(a, PRIORITY_FIELDS)),
        ),
        "delete": (
            ("priority_id",),
            lambda ctx, a: _delete(ctx, _priorities(ctx, f"{a['priority_id']}/"), a["priority_id"]),
        ),
    },
)


Tool(
    "label",
    """Labels of a project.

Actions: list (project_id); retrieve (project_id, label_id); create (project_id, name; optional color, description,
    parent, sort_order, external_source, external_id); update (project_id, label_id; the fields to change); delete
    (project_id, label_id).

color is a hex code such as #EF4444. parent is another label's UUID, for nesting.""",
    {
        "color": text(),
        "cursor": text(),
        "description": text(),
        "external_id": text(),
        "external_source": text(),
        "label_id": text(),
        "name": text(),
        "parent": text(),
        "per_page": integer(),
        "project_id": text(),
        "sort_order": optional("number"),
    },
    {
        "list": (("project_id",), lambda ctx, a: api(ctx, "GET", _labels(ctx, a), keep(a, ("cursor", "per_page")))),
        "retrieve": (("project_id", "label_id"), lambda ctx, a: api(ctx, "GET", _labels(ctx, a, f"{a['label_id']}/"))),
        "create": (
            ("project_id", "name"),
            lambda ctx, a: api(ctx, "POST", _labels(ctx, a), body=keep(a, LABEL_FIELDS)),
        ),
        "update": (
            ("project_id", "label_id"),
            lambda ctx, a: api(ctx, "PATCH", _labels(ctx, a, f"{a['label_id']}/"), body=keep(a, LABEL_FIELDS)),
        ),
        "delete": (
            ("project_id", "label_id"),
            lambda ctx, a: _delete(ctx, _labels(ctx, a, f"{a['label_id']}/"), a["label_id"]),
        ),
    },
)

# ------------------------------------------------------------------ members


def list_workspace_members(ctx, args):
    members = api(ctx, "GET", f"workspaces/{ctx.slug}/members/")
    members = members.get("results", members) if isinstance(members, dict) else members
    role = next((r["role"] for r in ROLES["workspace"] if r["slug"] == args.get("role_slug")), None)
    if args.get("role_slug") and role is None:
        raise ToolError("role_slug is admin, member or guest")
    out = []
    for member in members:
        if role is not None and member.get("role") != role:
            continue
        if any(
            args.get(name) and args[name].lower() not in str(member.get(name) or "").lower()
            for name in ("first_name", "last_name", "email", "display_name")
        ):
            continue
        if args.get("is_active") is not None and bool(member.get("is_active", True)) != args["is_active"]:
            continue
        if args.get("is_bot") is not None and bool(member.get("is_bot", False)) != args["is_bot"]:
            continue
        out.append(member)
    return out


def list_roles(ctx, args):
    namespace = args.get("namespace")
    if namespace and namespace not in ROLES:
        raise ToolError("namespace is workspace or project")
    return [
        dict(r, namespace=n, id=f"{n}:{r['slug']}")
        for n, roles in ROLES.items()
        if namespace in (None, "", n)
        for r in roles
    ]


def retrieve_role(ctx, args):
    role = next((r for r in list_roles(ctx, {}) if r["id"] == args["role_id"]), None)
    if role is None:
        raise ToolError("role_id is namespace:slug, such as workspace:admin; see list_roles")
    return role


Tool(
    "member",
    """Workspace and project members, and their roles.

Actions: me; list_workspace (optional first_name, last_name, email, display_name, role_slug, is_active, is_bot) --
    text filters match case-insensitively and combine with AND; list_project (project_id); list_roles (optional
    namespace); retrieve_role (role_id).

Roles are fixed on this Plane: admin (20), member (15) and guest (5), the same in both namespaces; a role id is
namespace:slug.""",
    {
        "cursor": text(),
        "display_name": text(),
        "email": text(),
        "first_name": text(),
        "is_active": optional("boolean"),
        "is_bot": optional("boolean"),
        "last_name": text(),
        "namespace": text(),
        "order_by": text(),
        "per_page": integer(),
        "project_id": text(),
        "role_id": text(),
        "role_slug": text(),
    },
    {
        "me": ((), lambda ctx, a: api(ctx, "GET", "users/me/")),
        "list_workspace": ((), list_workspace_members),
        "list_project": (
            ("project_id",),
            lambda ctx, a: api(ctx, "GET", f"workspaces/{ctx.slug}/projects/{a['project_id']}/members/"),
        ),
        "list_roles": ((), list_roles),
        "retrieve_role": (("role_id",), retrieve_role),
    },
)

# ---------------------------------------------------------------- workspace


def retrieve_workspace(ctx, args):
    return {
        "slug": ctx.workspace.slug,
        "id": str(ctx.workspace.id),
        "name": ctx.workspace.name,
        "connection": "agent_session" if ctx.agent_session is not None else "api_token",
    }


Tool(
    "workspace",
    """The workspace this connection works in.

Actions: retrieve -- slug, id, name and how the caller connected; get_features and update_features -- not available on
    this Plane yet (workspace features are fixed). For a project's features use `project get_features`.""",
    {
        "customers": optional("boolean"),
        "initiatives": optional("boolean"),
        "pi": optional("boolean"),
        "project_grouping": optional("boolean"),
        "teams": optional("boolean"),
        "wiki": optional("boolean"),
    },
    {"retrieve": ((), retrieve_workspace), "get_features": ((), None), "update_features": ((), None)},
)

# --------------------------------------------------------------------- PQL


def pql_reference(ctx, args):
    detail = args.get("detail") or "full"
    if detail not in ("brief", "full"):
        raise ToolError("detail is brief or full")
    try:
        text_ = PQL_README.read_text()
    except OSError:
        raise ToolError("The PQL reference is missing from this server")
    body = text_[text_.index("## Syntax") :] if "## Syntax" in text_ else text_
    if detail == "brief":
        start = body.index("## Fields") if "## Fields" in body else 0
        end = body.index("\n## ", start + 1) if "\n## " in body[start + 1 :] else len(body)
        operators = body[: body.index("Limits:")] if "Limits:" in body else ""
        body = operators + "\n" + body[start:end]
    return {"reference": body.strip()}


Tool(
    "get_pql_reference",
    """Plane Query Language (PQL) reference. Read it before writing a `pql` filter for workitem list, list_archived or
    count.

detail 'full' gives the syntax, fields, functions and examples; 'brief' gives the operators and the field table.""",
    {"detail": {"default": "full", "enum": ["brief", "full"], "type": "string"}},
    {"read": ((), pql_reference)},
    action_param=False,
)
