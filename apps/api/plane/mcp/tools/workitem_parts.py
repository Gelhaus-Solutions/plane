# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""What hangs off a work item: comments, relations, links, activity and attachments."""

import re
import uuid

from plane.mcp.dispatch import call
from plane.mcp.tools import Tool, ToolError, api, integer, keep, optional, paging, string_list, text


def _item(ctx, args, suffix=""):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/work-items/{args['workitem_id']}/{suffix}"


def _delete(ctx, path, ident):
    api(ctx, "DELETE", path)
    return {"deleted": ident}


# ------------------------------------------------------------------ comments

# Agents write @[<user id>]; Plane stores the editor's mention chip, which is what notifies the user
MENTION = re.compile(r"@\[([0-9a-fA-F-]{36})\]")
MENTION_TAG = re.compile(r"<mention-component\b([^>]*?)/?>(?:\s*</mention-component>)?", re.IGNORECASE)
ATTRIBUTE = re.compile(r'([\w-]+)\s*=\s*"([^"]*)"')
COMMENT_FIELDS = ("comment_html", "access", "external_source", "external_id")


def _mentions_in(ctx, args, value):
    mentioned = list(dict.fromkeys(found.lower() for found in MENTION.findall(value)))
    if mentioned:
        members = api(ctx, "GET", f"workspaces/{ctx.slug}/projects/{args['project_id']}/members/")
        known = {str(member["id"]).lower() for member in members}
        strangers = [ident for ident in mentioned if ident not in known]
        if strangers:
            raise ToolError(
                f"Not a member of this project: {', '.join(strangers)}. `member list_project` resolves a name to an id"
            )
    return MENTION.sub(
        lambda found: (
            f'<mention-component id="{uuid.uuid4()}" entity_identifier="{found.group(1).lower()}" '
            'entity_name="user_mention"></mention-component>'
        ),
        value,
    )


def _mentions_out(value):
    def swap(found):
        attributes = dict(ATTRIBUTE.findall(found.group(1)))
        if attributes.get("entity_name") == "user_mention" and attributes.get("entity_identifier"):
            return f"@[{attributes['entity_identifier']}]"
        return found.group(0)

    return MENTION_TAG.sub(swap, value)


def _readable(data):
    rows = data.get("results") if isinstance(data, dict) and "results" in data else [data]
    for row in rows or []:
        if isinstance(row, dict) and isinstance(row.get("comment_html"), str):
            row["comment_html"] = _mentions_out(row["comment_html"])
    return data


def _comment_body(ctx, args):
    body = keep(args, COMMENT_FIELDS)
    if "comment_html" in body:
        body["comment_html"] = _mentions_in(ctx, args, body["comment_html"])
    return body


def comment_update(ctx, args):
    body = _comment_body(ctx, args)
    if not body:
        raise ToolError("Nothing to change: pass comment_html, access, external_source or external_id")
    return _readable(api(ctx, "PATCH", _item(ctx, args, f"comments/{args['comment_id']}/"), body=body))


Tool(
    "workitem_comment",
    """Comments on a work item.

Actions:
  list (project_id, workitem_id; optional cursor, per_page);
  retrieve (project_id, workitem_id, comment_id);
  create (project_id, workitem_id, comment_html; optional access, external_source, external_id);
  update (project_id, workitem_id, comment_id; optional comment_html, access, external_source, external_id);
  delete (project_id, workitem_id, comment_id).

comment_html is HTML, e.g. '<p>Looks good.</p>'. access is INTERNAL or EXTERNAL.
To mention someone, write @[<user uuid>] inline, as in '<p>@[<user uuid>] can you review?</p>': the chip and the
notification are generated for you. A bare @name is ordinary text that notifies nobody. The id must belong to a member
of the work item's project; `member list_project` resolves a name to one. Mentions read back in the same form.""",
    {
        "access": text(),
        "comment_html": text(),
        "comment_id": text(),
        "cursor": text(),
        "external_id": text(),
        "external_source": text(),
        "per_page": integer(),
        "project_id": text(),
        "workitem_id": text(),
    },
    {
        "list": (
            ("project_id", "workitem_id"),
            lambda ctx, a: _readable(api(ctx, "GET", _item(ctx, a, "comments/"), paging(a))),
        ),
        "retrieve": (
            ("project_id", "workitem_id", "comment_id"),
            lambda ctx, a: _readable(api(ctx, "GET", _item(ctx, a, f"comments/{a['comment_id']}/"))),
        ),
        "create": (
            ("project_id", "workitem_id", "comment_html"),
            lambda ctx, a: _readable(api(ctx, "POST", _item(ctx, a, "comments/"), body=_comment_body(ctx, a))),
        ),
        "update": (("project_id", "workitem_id", "comment_id"), comment_update),
        "delete": (
            ("project_id", "workitem_id", "comment_id"),
            lambda ctx, a: _delete(ctx, _item(ctx, a, f"comments/{a['comment_id']}/"), a["comment_id"]),
        ),
    },
)


# ----------------------------------------------------------------- relations

RELATION_TYPES = (
    "blocking",
    "blocked_by",
    "duplicate",
    "relates_to",
    "start_before",
    "start_after",
    "finish_before",
    "finish_after",
)


def relation_create(ctx, args):
    if args.get("relation_definition_id") or args.get("relation_definition_label"):
        raise ToolError("Custom relation definitions are not available on this Plane yet: pass relation_type")
    if args.get("relation_type") not in RELATION_TYPES:
        raise ToolError(f"relation_type must be one of: {', '.join(RELATION_TYPES)}")
    body = {"relation_type": args["relation_type"], "issues": args["workitem_ids"]}
    return api(ctx, "POST", _item(ctx, args, "relations/"), body=body)


Tool(
    "workitem_relation",
    """Relations between work items.

Actions:
  list (project_id, workitem_id) -- the related work items grouped by relation type, each with its project_id;
  create (project_id, workitem_id, workitem_ids, relation_type);
  delete -- not available on this Plane yet;
  list_definitions, create_definition, update_definition, delete_definition -- not available on this Plane yet
      (custom relation definitions do not exist here).

relation_type is blocking, blocked_by, duplicate, relates_to, start_before, start_after, finish_before or
finish_after, read from workitem_id: relation_type=blocked_by means workitem_id is blocked by each of workitem_ids.
Related work items may be in other projects of the workspace.""",
    {
        "color": text(),
        "definition_id": text(),
        "inward": text(),
        "is_active": optional("boolean"),
        "is_default": optional("boolean"),
        "is_dependency": {"default": False, "type": "boolean"},
        "name": text(),
        "outward": text(),
        "project_id": text(),
        "related_workitem_id": text(),
        "relation_definition_id": text(),
        "relation_definition_label": text(),
        "relation_type": text(),
        "workitem_id": text(),
        "workitem_ids": string_list(),
    },
    {
        "list": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "GET", _item(ctx, a, "relations/"))),
        "create": (("project_id", "workitem_id", "workitem_ids"), relation_create),
        "delete": (("project_id", "workitem_id", "related_workitem_id"), None),
        "list_definitions": ((), None),
        "create_definition": (("name",), None),
        "update_definition": (("definition_id",), None),
        "delete_definition": (("definition_id",), None),
    },
)


# --------------------------------------------------------------------- links


def link_update(ctx, args):
    body = keep(args, ("url", "title"))
    if not body:
        raise ToolError("Nothing to change: pass url or title")
    return api(ctx, "PATCH", _item(ctx, args, f"links/{args['link_id']}/"), body=body)


Tool(
    "workitem_link",
    """External links attached to a work item.

Actions:
  list (project_id, workitem_id; optional cursor, per_page);
  retrieve (project_id, workitem_id, link_id);
  create (project_id, workitem_id, url; optional title);
  update (project_id, workitem_id, link_id; optional url, title) -- pass at least one of url or title; only the fields
      you pass are changed;
  delete (project_id, workitem_id, link_id).

url must be http:// or https://. title is the text Plane shows in place of the URL, e.g. title='Design spec' for a
long Figma link; without one the URL itself is shown.""",
    {
        "cursor": text(),
        "link_id": text(),
        "per_page": integer(),
        "project_id": text(),
        "title": text(),
        "url": text(),
        "workitem_id": text(),
    },
    {
        "list": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "GET", _item(ctx, a, "links/"), paging(a))),
        "retrieve": (
            ("project_id", "workitem_id", "link_id"),
            lambda ctx, a: api(ctx, "GET", _item(ctx, a, f"links/{a['link_id']}/")),
        ),
        "create": (
            ("project_id", "workitem_id", "url"),
            lambda ctx, a: api(ctx, "POST", _item(ctx, a, "links/"), body=keep(a, ("url", "title"))),
        ),
        "update": (("project_id", "workitem_id", "link_id"), link_update),
        "delete": (
            ("project_id", "workitem_id", "link_id"),
            lambda ctx, a: _delete(ctx, _item(ctx, a, f"links/{a['link_id']}/"), a["link_id"]),
        ),
    },
)


# ------------------------------------------------------------------ activity

Tool(
    "workitem_activity",
    """Change history for a work item.

Actions:
  list (project_id, workitem_id; optional cursor, per_page);
  retrieve (project_id, workitem_id, activity_id).""",
    {
        "activity_id": text(),
        "cursor": text(),
        "per_page": integer(),
        "project_id": text(),
        "workitem_id": text(),
    },
    {
        "list": (
            ("project_id", "workitem_id"),
            lambda ctx, a: api(ctx, "GET", _item(ctx, a, "activities/"), paging(a)),
        ),
        "retrieve": (
            ("project_id", "workitem_id", "activity_id"),
            lambda ctx, a: api(ctx, "GET", _item(ctx, a, f"activities/{a['activity_id']}/")),
        ),
    },
)


# --------------------------------------------------------------- attachments


def download_url(ctx, args):
    """The detail endpoint answers with a redirect to a short-lived presigned URL; hand that URL over."""
    result = call(ctx, "GET", _item(ctx, args, f"attachments/{args['attachment_id']}/"))
    if 300 <= result.status < 400 and result.location:
        return {"attachment_id": args["attachment_id"], "url": result.location}
    raise ToolError(f"Plane answered {result.status}: {result.data if result.data is not None else ''}")


Tool(
    "workitem_attachment",
    """Files attached to a work item.

Actions:
  list (project_id, workitem_id);
  download_url (project_id, workitem_id, attachment_id) -- a short-lived link that downloads the file;
  delete (project_id, workitem_id, attachment_id);
  read, upload_from_url -- not available on this Plane yet.

Get attachment_id from the list action.""",
    {
        "attachment_id": text(),
        "name": text(),
        "project_id": text(),
        "url": text(),
        "workitem_id": text(),
    },
    {
        "list": (("project_id", "workitem_id"), lambda ctx, a: api(ctx, "GET", _item(ctx, a, "attachments/"))),
        "read": (("project_id", "workitem_id", "attachment_id"), None),
        "download_url": (("project_id", "workitem_id", "attachment_id"), download_url),
        "upload_from_url": (("project_id", "workitem_id", "url"), None),
        "delete": (
            ("project_id", "workitem_id", "attachment_id"),
            lambda ctx, a: _delete(ctx, _item(ctx, a, f"attachments/{a['attachment_id']}/"), a["attachment_id"]),
        ),
    },
)
