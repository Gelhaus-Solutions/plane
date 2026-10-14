# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""A project's intake (triage) queue."""

from plane.mcp.tools import Tool, ToolError, api, integer, keep, optional, paging, text

TRIAGE_FIELDS = ("status", "snoozed_till", "duplicate_to", "source", "source_email")


def _intake(ctx, args, suffix=""):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/intake-issues/{suffix}"


def create(ctx, args):
    return api(ctx, "POST", _intake(ctx, args), body={"issue": keep(args, ("name", "description_html", "priority"))})


def update(ctx, args):
    body = keep(args, TRIAGE_FIELDS)
    if not body:
        raise ToolError("Nothing to change: pass status or another triage field")
    result = api(ctx, "PATCH", _intake(ctx, args, f"{args['workitem_id']}/"), body=body)
    # Plane answers 200 but leaves the triage fields alone unless the caller is a project admin
    if "status" in body and isinstance(result, dict) and result.get("status") != body["status"]:
        raise ToolError("Plane kept the old status: only a project admin can make a triage decision")
    return result


def delete(ctx, args):
    api(ctx, "DELETE", _intake(ctx, args, f"{args['workitem_id']}/"))
    return {"deleted": args["workitem_id"]}


Tool(
    "intake",
    """The intake (triage) queue for a project.

Actions:
  list (project_id; optional cursor, per_page);
  retrieve (project_id, workitem_id);
  create (project_id, name; optional description_html, priority);
  update (project_id, workitem_id; optional status, snoozed_till, duplicate_to, source, source_email) -- pass status to
      make a triage decision, which needs a project admin;
  delete (project_id, workitem_id).

workitem_id is the `issue` field of an intake record, not the record's own id. status: -2 pending, -1 declined,
0 snoozed (needs snoozed_till), 1 accepted, 2 duplicate (needs duplicate_to). priority is one of: urgent, high,
medium, low, none. Intake must be enabled for the project (`project update_features`).""",
    {
        "cursor": text(),
        "description_html": text(),
        "duplicate_to": text(),
        "name": text(),
        "per_page": integer(),
        "priority": text(),
        "project_id": text(),
        "snoozed_till": text(),
        "source": text(),
        "source_email": text(),
        "status": optional("integer"),
        "workitem_id": text(),
    },
    {
        "list": (("project_id",), lambda ctx, a: api(ctx, "GET", _intake(ctx, a), paging(a))),
        "retrieve": (
            ("project_id", "workitem_id"),
            lambda ctx, a: api(ctx, "GET", _intake(ctx, a, f"{a['workitem_id']}/")),
        ),
        "create": (("project_id", "name"), create),
        "update": (("project_id", "workitem_id"), update),
        "delete": (("project_id", "workitem_id"), delete),
    },
)
