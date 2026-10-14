# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The session inbox (E28): what Plane has for this session, read and acknowledged over the MCP connection."""

from plane.mcp.tools import Tool, ToolError, api, integer, string_list


def _inbox(ctx):
    if ctx.agent_session is None:
        raise ToolError("agent_inbox is for an agent session: connect with a session token, not the bot's own key")
    return f"workspaces/{ctx.slug}/agent-sessions/{ctx.agent_session.id}/inbox/"


def _list(ctx, args):
    query = {"after": args.get("after") or None, "limit": args.get("limit") or None}
    return api(ctx, "GET", _inbox(ctx), query=query)


def _ack(ctx, args):
    body = {}
    if args.get("ids"):
        body["ids"] = args["ids"]
    if args.get("through"):
        body["through"] = args["through"]
    if not body:
        raise ToolError("agent_inbox ack needs ids or through")
    return api(ctx, "POST", _inbox(ctx) + "ack/", body=body)


def _work(ctx, args):
    return api(ctx, "GET", _inbox(ctx).replace("/inbox/", "/work/"))


Tool(
    "agent_inbox",
    """Messages Plane has for this session: mentions of you or of your bot, comments on work items you hold.

Actions:
  list (after, limit) -- unacknowledged messages, oldest first, with `cursor` and `has_more`; pass the cursor as
      `after` for the next page. Messages sent to your bot rather than to you (to = "queue") are open to any
      session of the bot;
  ack (ids or through) -- mark messages as handled, by id or everything up to a cursor; a queue message goes to the
      first session that acknowledges it;
  work -- open work items assigned to this session (`assigned`) and unclaimed ones in your bot's queue (`queue`);
      take a queue item by claiming it.

Read the inbox when you start and between tasks, and acknowledge what you have dealt with.""",
    {"after": integer(), "limit": integer(), "ids": string_list(), "through": integer()},
    {"list": ((), _list), "ack": ((), _ack), "work": ((), _work)},
)
