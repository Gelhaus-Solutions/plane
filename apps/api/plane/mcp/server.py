# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""JSON-RPC for MCP: initialize, ping, tools/list, tools/call; notifications are accepted and ignored."""

import json
import logging
import pathlib

from plane.mcp.tools import REGISTRY, ToolError

logger = logging.getLogger("plane.api")

PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")

PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR = -32700, -32600, -32601, -32602, -32603

INSTRUCTIONS = """Plane work tracking for this workspace.

Find work with `workitem list` and a `pql` filter instead of listing whole projects; read `get_pql_reference` first.
Name a work item by its key (ENG-42) with `workitem retrieve_by_identifier`. Ids in arguments are UUIDs: resolve names
with `project list`, `state list`, `label list` or `member list_workspace` first.
description_html and comment HTML are stored as given: send <p>text</p>, never escaped text such as &lt;p&gt;.
Epics are work items of the Epic type: pql `isEpic()` lists them, and `childOf("ENG-7")` lists an epic's work items
(its sub-items). Older projects may still mark epics with an `epic` label instead.
For counts and trends (how much work was created, done or resolved over time, by state, priority or assignee) use
`dashboard chart` with a PQL query instead of paging through work items; `dashboard data` reads a saved dashboard."""


def _version():
    try:
        root = pathlib.Path(__file__).resolve().parents[2]
        return json.loads((root / "package.json").read_text()).get("version", "fork")
    except (OSError, ValueError):
        return "fork"


SERVER_INFO = {"name": "plane", "title": "Plane", "version": _version()}


class RpcError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def rpc_error(message_id, code, message):
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}


def initialize(ctx_factory, params):
    asked = (params or {}).get("protocolVersion")
    return {
        "protocolVersion": asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0],
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": SERVER_INFO,
        "instructions": INSTRUCTIONS,
    }


def list_tools(ctx_factory, params):
    return {"tools": [tool.definition() for tool in REGISTRY.values()]}


def call_tool(ctx_factory, params):
    params = params or {}
    tool = REGISTRY.get(params.get("name"))
    if tool is None:
        raise RpcError(INVALID_PARAMS, f"Unknown tool: {params.get('name')}")
    arguments = params.get("arguments") or {}
    if not isinstance(arguments, dict):
        raise RpcError(INVALID_PARAMS, "arguments must be an object")
    try:
        data = tool.run(ctx_factory(), arguments)
    except ToolError as error:
        return {"content": [{"type": "text", "text": str(error)}], "isError": True}
    except Exception:
        logger.exception("MCP tool %s failed", tool.name)
        return {"content": [{"type": "text", "text": f"{tool.name} failed on the server"}], "isError": True}
    return {"content": [{"type": "text", "text": json.dumps(data, default=str)}], "isError": False}


METHODS = {
    "initialize": initialize,
    "ping": lambda ctx_factory, params: {},
    "tools/list": list_tools,
    "tools/call": call_tool,
}


def handle(message, ctx_factory):
    """One JSON-RPC message in, its response out; None for a notification or a client response."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return rpc_error(None, INVALID_REQUEST, "Not a JSON-RPC 2.0 message")
    message_id = message.get("id")
    method = message.get("method")
    if method is None:
        return None  # a response to something we never ask
    if "id" not in message:
        return None  # notifications/initialized, notifications/cancelled and the like
    handler = METHODS.get(method)
    if handler is None:
        return rpc_error(message_id, METHOD_NOT_FOUND, f"Method not found: {method}")
    try:
        return {"jsonrpc": "2.0", "id": message_id, "result": handler(ctx_factory, message.get("params"))}
    except RpcError as error:
        return rpc_error(message_id, error.code, error.message)
    except Exception:
        logger.exception("MCP method %s failed", method)
        return rpc_error(message_id, INTERNAL_ERROR, "Internal error")
