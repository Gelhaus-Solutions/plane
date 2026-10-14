# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agents on work items (E28): assign a bot's queue or one of its sessions, or delegate to a bot."""

from plane.mcp.tools import Tool, api, text


def _agents(ctx, args):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/work-items/{args['workitem_id']}/agents/"


def _assign(ctx, args):
    body = {key: args[key] for key in ("bot", "session") if args.get(key)}
    body["delegate"] = bool(args.get("delegate"))
    return api(ctx, "POST", _agents(ctx, args), body=body)


def _unassign(ctx, args):
    return api(ctx, "DELETE", _agents(ctx, args), query={"bot": args["bot"]})


Tool(
    "workitem_agent",
    """Put an agent on a work item: a bot's queue, one of its sessions, or a bot that works for the human assignee.

Actions:
  list (project_id, workitem_id) -- the agents on the item, each with state `queue` (any session of the bot may take
      it by claiming), `session`, or `waiting` (its session ended; the next session in the same directory gets it);
  assign (project_id, workitem_id, bot or session, delegate) -- name a bot (id or its user id) to put the item in its
      queue, or a session (id) to give it to that session; delegate = true makes the bot work for the item's human
      assignee, who stays accountable. Naming the same thing again changes nothing; the session is told;
  unassign (project_id, workitem_id, bot) -- take the bot off the item.

Find your bot's queue with `agent_inbox work`.""",
    {
        "project_id": text(),
        "workitem_id": text(),
        "bot": text(),
        "session": text(),
        "delegate": {"default": False, "type": "boolean"},
    },
    {
        "list": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "GET", _agents(ctx, a))),
        "assign": (("project_id", "workitem_id"), _assign),
        "unassign": (("project_id", "workitem_id", "bot"), _unassign),
    },
)
