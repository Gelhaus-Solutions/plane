# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The tool registry: names, argument schemas and per-action handlers."""

import re

from plane.mcp.dispatch import call

REGISTRY = {}

NOT_HERE = "{tool} {action} is not available on this Plane yet"


class ToolError(Exception):
    """A tool call that cannot be done; the message goes back to the agent as is."""


def keep(args, names):
    """What the caller set; an empty string means "leave it"."""
    return {name: args[name] for name in names if name in args and args[name] is not None and args[name] != ""}


def paging(args):
    """cursor and per_page when given; per_page 0 is the schema default and means the API's own page size."""
    return {name: args[name] for name in ("cursor", "per_page") if args.get(name)}


def split_ids(value):
    """One id or several, separated by commas or spaces."""
    return [part for part in re.split(r"[\s,]+", value or "") if part]


def text(default=""):
    return {"default": default, "type": "string"}


def integer(default=0):
    return {"default": default, "type": "integer"}


def number(default=0):
    return {"default": default, "type": "number"}


def optional(kind, default=None):
    return {"anyOf": [{"type": kind}, {"type": "null"}], "default": default}


def string_list():
    return {"anyOf": [{"items": {"type": "string"}, "type": "array"}, {"type": "null"}], "default": None}


class Tool:
    def __init__(self, name, description, properties, actions, action_param=True):
        """``actions`` maps an action to ``(required parameters, handler)``; a handler of None is not available."""
        self.name = name
        self.description = description
        self.actions = actions
        self.action_param = action_param
        props = dict(properties)
        if action_param:
            props = {"action": {"enum": list(actions), "type": "string"}, **props}
        self.input_schema = {
            "additionalProperties": False,
            "properties": props,
            "required": ["action"] if action_param else [],
            "type": "object",
        }
        REGISTRY[name] = self

    def definition(self):
        return {"name": self.name, "description": self.description, "inputSchema": self.input_schema}

    def run(self, ctx, arguments):
        arguments = dict(arguments or {})
        unknown = set(arguments) - set(self.input_schema["properties"])
        if unknown:
            raise ToolError(f"Unknown argument(s) for {self.name}: {', '.join(sorted(unknown))}")
        action = arguments.pop("action", None) if self.action_param else "read"
        if action not in self.actions:
            raise ToolError(f"action must be one of: {', '.join(self.actions)}")
        required, handler = self.actions[action]
        if handler is None:
            raise ToolError(NOT_HERE.format(tool=self.name, action=action))
        missing = [name for name in required if arguments.get(name) in (None, "", [])]
        if missing:
            raise ToolError(f"{self.name} {action} needs: {', '.join(missing)}")
        return handler(ctx, arguments)


def api(ctx, method, path, query=None, body=None):
    """A public API call whose failure becomes a tool error carrying the API's own message."""
    result = call(ctx, method, path, query=query, body=body)
    if not result.ok:
        detail = result.data if result.data is not None else ""
        raise ToolError(f"Plane answered {result.status}: {detail}")
    return result.data if result.data is not None else {"ok": True}


# The tool modules register themselves on import
from plane.mcp.tools import catalog, cycle, intake, project, workitem, workitem_parts  # noqa: E402,F401
