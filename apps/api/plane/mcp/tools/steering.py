# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent steering (E29): tell people where the work stands, ask them questions, finish into Review."""

from plane.mcp.tools import Tool, api, integer, optional, text


def _item(ctx, args, tail=""):
    return f"workspaces/{ctx.slug}/projects/{args['project_id']}/work-items/{args['workitem_id']}/{tail}"


def _set(args, *names):
    """What the caller gave: unset text, empty lists and the schema's zero are left out."""
    return {name: args[name] for name in names if args.get(name) not in (None, "", [], 0)}


# ------------------------------------------------------------------ questions


def _ask(ctx, args):
    body = _set(args, "question", "detail", "options", "default", "deadline", "deadline_minutes")
    return api(ctx, "POST", _item(ctx, args, "questions/"), body=body)


Tool(
    "workitem_question",
    """Ask a person a question on a work item and carry on or wait for the answer.

Actions:
  ask (project_id, workitem_id, question, options, detail, default, deadline, deadline_minutes) -- put a question on
      the item; it shows as awaiting input and in the person's Needs you list. `options` are the choices, each a
      string or {label, detail}, at most 8; `default` is the number (from 1) of the option that applies if nobody
      answers by `deadline` (an ISO 8601 time) or within `deadline_minutes`. Without a deadline the question waits;
      with a deadline and no default it lapses and you decide yourself;
  list (project_id, workitem_id, status) -- the item's questions; `status` narrows by open, answered, defaulted,
      expired or cancelled;
  retrieve (project_id, workitem_id, question_id) -- one question with its answer;
  cancel (project_id, workitem_id, question_id) -- withdraw a question you no longer need answered.

The answer arrives in your inbox (`agent_inbox list`) as a message of kind `answer`: from a person, or the default
once the deadline passed. A person can still answer after the default applied; that reaches you as a correction.
Ask sparingly, with a default you can live with, and keep working on what the answer does not change.""",
    {
        "project_id": text(),
        "workitem_id": text(),
        "question_id": text(),
        "question": text(),
        "detail": text(),
        "options": optional("array"),
        "default": integer(),
        "deadline": text(),
        "deadline_minutes": integer(),
        "status": text(),
    },
    {
        "ask": (("project_id", "workitem_id", "question"), _ask),
        "list": (
            ("project_id", "workitem_id"),
            lambda ctx, a: api(ctx, "GET", _item(ctx, a, "questions/"), query=_set(a, "status")),
        ),
        "retrieve": (
            ("project_id", "workitem_id", "question_id"),
            lambda ctx, a: api(ctx, "GET", _item(ctx, a, f"questions/{a['question_id']}/")),
        ),
        "cancel": (
            ("project_id", "workitem_id", "question_id"),
            lambda ctx, a: api(ctx, "DELETE", _item(ctx, a, f"questions/{a['question_id']}/")),
        ),
    },
)


# ------------------------------------------------------------------ status, plan, log, review


def _claim(ctx, args, body):
    return api(ctx, "PATCH", _item(ctx, args, "claim/"), body=body)


def _plan(ctx, args):
    body = {"plan": args["steps"]}
    if args.get("current"):
        body["plan_current"] = args["current"]
    return _claim(ctx, args, body)


Tool(
    "workitem_progress",
    """Tell people where your work on an item stands, and hand it back for review. Status, plan and the claim belong
together: claim the item first (`workitem_claim`).

Actions:
  status (project_id, workitem_id, status, text) -- the live status line on the item and the Agents page: `status` is
      working, waiting_for_review or blocked; `text` is one line on what you are doing now (200 characters);
  plan (project_id, workitem_id, steps, current) -- keep the plan checklist current: `steps` is the whole plan, each
      step a string or {title, state} with state todo, doing or done; `current` is the number (from 1) of the step in
      progress, so earlier ones read done and later ones todo;
  log (project_id, workitem_id, kind, text, ref, url) -- an entry in the item's agent activity: `kind` is progress,
      error, commit (`ref` the sha), or pull_request (`ref` the number); `url` links to it;
  review (project_id, workitem_id, text) -- you are done: the item moves to the project's Review state with `text`
      as the summary, for a person to close. You cannot close it yourself;
  list (project_id, workitem_id, kind) -- the item's agent activity, newest first.

Update the status when your work changes direction, the plan as you finish each step, and log what a person would
want to know without opening the repository: errors you hit, commits and pull requests you made.""",
    {
        "project_id": text(),
        "workitem_id": text(),
        "status": text(),
        "text": text(),
        "steps": optional("array"),
        "current": integer(),
        "kind": text(),
        "ref": text(),
        "url": text(),
    },
    {
        "status": (
            ("project_id", "workitem_id"),
            lambda ctx, a: _claim(
                ctx,
                a,
                {key: value for key, value in (("status", a.get("status")), ("status_text", a.get("text"))) if value},
            ),
        ),
        "plan": (("project_id", "workitem_id", "steps"), _plan),
        "log": (
            ("project_id", "workitem_id", "kind", "text"),
            lambda ctx, a: api(
                ctx, "POST", _item(ctx, a, "agent-activity/"), body=_set(a, "kind", "text", "ref", "url")
            ),
        ),
        "review": (
            ("project_id", "workitem_id"),
            lambda ctx, a: api(ctx, "POST", _item(ctx, a, "review/"), body=_set(a, "text")),
        ),
        "list": (
            ("project_id", "workitem_id"),
            lambda ctx, a: api(ctx, "GET", _item(ctx, a, "agent-activity/"), query=_set(a, "kind")),
        ),
    },
)
