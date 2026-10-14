# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Custom work item properties (D39), in the old server's workitem_property shape (D6)."""

import json
import uuid

from plane.mcp.tools import Tool, ToolError, api, integer, keep, optional, text

FIELDS = (
    "display_name",
    "description",
    "property_type",
    "relation_type",
    "display_format",
    "external_source",
    "external_id",
)
FLAGS = ("is_required", "is_multi", "is_active")
OPTION_FIELDS = ("name", "description", "color", "external_source", "external_id")
NO_TYPES = (
    "Work item types are not available on this Plane yet: properties apply to every work item, "
    "leave out workitem_type_id"
)


def _props(ctx, suffix=""):
    return f"workspaces/{ctx.slug}/work-item-properties/{suffix}"


def _resolve(ctx, ref):
    """A property id, or the id of the property with that name or display name."""
    try:
        return str(uuid.UUID(str(ref)))
    except ValueError:
        pass
    for prop in api(ctx, "GET", _props(ctx)):
        if str(ref).lower() in (prop["name"].lower(), prop["display_name"].lower()):
            return prop["id"]
    raise ToolError(f"No property named {ref}; `workitem_property list` shows them")


def _json(value, name):
    if value in (None, ""):
        return None
    try:
        return json.loads(value)
    except ValueError:
        if name == "default_value":
            return value
        raise ToolError(f"{name} must be JSON")


def _definition(args):
    if args.get("workitem_type_id"):
        raise ToolError(NO_TYPES)
    if args.get("property_type"):
        args = {**args, "property_type": args["property_type"].upper()}
    if args.get("relation_type"):
        if args["relation_type"].upper() == "RICH_TEXT":
            raise ToolError("Rich text properties are not available on this Plane yet")
        args = {**args, "relation_type": args["relation_type"].upper()}
    body = keep(args, FIELDS)
    body.update({flag: args[flag] for flag in FLAGS if args.get(flag) is not None})
    default = _json(args.get("default_value"), "default_value")
    if default is not None:
        body["default_value"] = default
    return body


def create(ctx, args):
    body = _definition(args)
    options = _json(args.get("options"), "options")
    if options is not None:
        body["options"] = options
    return api(ctx, "POST", _props(ctx), body=body)


def update(ctx, args):
    body = _definition(args)
    if not body:
        raise ToolError("Nothing to change: pass at least one field")
    return api(ctx, "PATCH", _props(ctx, f"{_resolve(ctx, args['workitem_property_id'])}/"), body=body)


def delete(ctx, args):
    ident = _resolve(ctx, args["workitem_property_id"])
    api(ctx, "DELETE", _props(ctx, f"{ident}/"))
    return {"deleted": ident}


def _options(ctx, args, suffix=""):
    return _props(ctx, f"{_resolve(ctx, args['property_id'])}/options/{suffix}")


def create_option(ctx, args):
    body = keep(args, OPTION_FIELDS)
    if args.get("is_default") is not None:
        body["is_default"] = args["is_default"]
    return api(ctx, "POST", _options(ctx, args), body=body)


def update_option(ctx, args):
    body = keep(args, OPTION_FIELDS)
    if args.get("is_default") is not None:
        body["is_default"] = args["is_default"]
    if not body:
        raise ToolError("Nothing to change: pass at least one field")
    return api(ctx, "PATCH", _options(ctx, args, f"{args['option_id']}/"), body=body)


def delete_option(ctx, args):
    api(ctx, "DELETE", _options(ctx, args, f"{args['option_id']}/"))
    return {"deleted": args["option_id"]}


def _value(ctx, args):
    prop = _resolve(ctx, args["property_id"])
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/work-items/{args['workitem_id']}/properties/{prop}/"


def set_value(ctx, args):
    if args.get("description_html"):
        raise ToolError("Rich text properties are not available on this Plane yet")
    if "value" not in args:
        raise ToolError("Pass value; null or [] clears it")
    return api(ctx, "PUT", _value(ctx, args), body={"value": args["value"]})


def delete_value(ctx, args):
    api(ctx, "DELETE", _value(ctx, args))
    return {"deleted": args["property_id"]}


Tool(
    "workitem_property",
    """Custom work item properties, their options, and their values on work items.

Actions:
  list (no required params) -- every property of the workspace with its options;
  retrieve (workitem_property_id);
  create (display_name, property_type; optional description, relation_type, is_required, is_multi, is_active,
      default_value, options, display_format, external_source, external_id);
  update (workitem_property_id; the fields to change) -- the type stays once work items carry values;
  delete (workitem_property_id) -- removes its values too;
  manage_type_properties -- not available on this Plane yet;
  list_options (property_id); retrieve_option (property_id, option_id);
  create_option (property_id, name; optional description, color, is_default, external_source, external_id);
  update_option (property_id, option_id; the fields to change); delete_option (property_id, option_id);
  get_value (project_id, workitem_id, property_id); set_value (project_id, workitem_id, property_id, value) -- replaces
      every value, null or [] clears; delete_value (project_id, workitem_id, property_id).

Properties belong to the workspace and apply to every work item (types come later). property_type is TEXT, DATETIME,
DECIMAL, BOOLEAN, OPTION, RELATION (relation_type USER or ISSUE), URL or EMAIL. Wherever a property id is asked for,
its name or display name works too. options takes a JSON array of {"name", "color", "description", "is_default"}.
Send value in the property's own type: text as a string, DATETIME as YYYY-MM-DD or YYYY-MM-DD HH:MM:SS, DECIMAL as a
number, BOOLEAN as true or false, OPTION as an option id or name, RELATION as a user or work item id; a list of them
for a multi-value property. Filter with PQL cf["<property name or id>"], for example cf["Severity"] = "High".""",
    {
        "attach_ids": text(),
        "color": text(),
        "cursor": text(),
        "default_value": text(),
        "description": text(),
        "description_html": text(),
        "detach_ids": text(),
        "display_format": text(),
        "display_name": text(),
        "external_id": text(),
        "external_source": text(),
        "is_active": optional("boolean"),
        "is_default": optional("boolean"),
        "is_multi": optional("boolean"),
        "is_required": optional("boolean"),
        "name": text(),
        "option_id": text(),
        "options": text(),
        "per_page": integer(),
        "project_id": text(),
        "property_id": text(),
        "property_type": text(),
        "relation_type": text(),
        "value": {
            "anyOf": [
                {"type": "string"},
                {"type": "boolean"},
                {"type": "integer"},
                {"type": "number"},
                {"items": {"type": "string"}, "type": "array"},
            ],
            "default": "",
        },
        "workitem_id": text(),
        "workitem_property_id": text(),
        "workitem_type_id": text(),
    },
    {
        "list": ((), lambda ctx, a: api(ctx, "GET", _props(ctx))),
        "retrieve": (
            ("workitem_property_id",),
            lambda ctx, a: api(ctx, "GET", _props(ctx, f"{_resolve(ctx, a['workitem_property_id'])}/")),
        ),
        "create": (("display_name", "property_type"), create),
        "update": (("workitem_property_id",), update),
        "delete": (("workitem_property_id",), delete),
        "manage_type_properties": (("workitem_type_id",), None),
        "list_options": (("property_id",), lambda ctx, a: api(ctx, "GET", _options(ctx, a))),
        "retrieve_option": (
            ("property_id", "option_id"),
            lambda ctx, a: api(ctx, "GET", _options(ctx, a, f"{a['option_id']}/")),
        ),
        "create_option": (("property_id", "name"), create_option),
        "update_option": (("property_id", "option_id"), update_option),
        "delete_option": (("property_id", "option_id"), delete_option),
        "get_value": (("project_id", "workitem_id", "property_id"), lambda ctx, a: api(ctx, "GET", _value(ctx, a))),
        "set_value": (("project_id", "workitem_id", "property_id"), set_value),
        "delete_value": (("project_id", "workitem_id", "property_id"), delete_value),
    },
)
