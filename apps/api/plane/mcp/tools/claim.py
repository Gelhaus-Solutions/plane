# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Claims (E28): a session says it works on a work item, so no other session takes it at the same time."""

from plane.mcp.tools import Tool, api, text


def _claim(ctx, args):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/work-items/{args['workitem_id']}/claim/"


Tool(
    "workitem_claim",
    """Claim a work item for this session while you work on it.

Actions:
  retrieve (project_id, workitem_id) -- the open claim, or null;
  claim (project_id, workitem_id) -- refused while another live session holds it, naming that session; a claim held
      by a session that ended or went quiet is taken over;
  release (project_id, workitem_id) -- when you stop working on it.

Claim before you start on an item and release it when you hand it back. A claim lapses on its own when this session
ends or is silent for 30 minutes. Find your claims with `workitem list` and pql `claimedBy = currentSession()`,
unclaimed work with `claimedBy IS EMPTY`.""",
    {"project_id": text(), "workitem_id": text()},
    {
        "retrieve": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "GET", _claim(ctx, a))),
        "claim": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "POST", _claim(ctx, a))),
        "release": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "DELETE", _claim(ctx, a))),
    },
)
