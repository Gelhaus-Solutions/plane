# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent steering (E29): what an agent session tells people about its work, and what it asks them.

- **Status and plan** live on the session's claim (what the Agents page and the item header show) and are kept as
  history in ``AgentActivity``, next to progress, errors and links to commits and pull requests.
- **Questions** wait for a person. The answer goes to the asking session's inbox (the bot's queue once the session has
  ended); when a deadline passes the default applies and the session is told, and a later answer still reaches it as a
  correction.
- **Review**: an agent finishes into the project's Review state and a person closes (D28).
- **Needs you**: the open questions and the items in Review, newest first, for the people who may answer them.
"""

import json
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    AgentActivity,
    AgentInboxMessage,
    AgentQuestion,
    AgentSession,
    Issue,
    IssueActivity,
    WorkItemClaim,
)
from plane.utils import agent_inbox, agent_sessions
from plane.utils.agent_assignments import CLOSED_GROUPS
from plane.utils.agent_sessions import SessionError, claim_progress, plan_summary, session_lite
from plane.utils.state_groups import review_state

STATUS_LIMIT = 200
TEXT_LIMIT = 500
URL_LIMIT = 500
REF_LIMIT = 100
PLAN_STEPS = 30
PLAN_STEP_LIMIT = 200
PLAN_STATES = ("todo", "doing", "done")
LOG_KINDS = (
    AgentActivity.Kind.PROGRESS,
    AgentActivity.Kind.ERROR,
    AgentActivity.Kind.COMMIT,
    AgentActivity.Kind.PULL_REQUEST,
)
QUESTION_LIMIT = 500
DETAIL_LIMIT = 2000
OPTIONS_MAX = 8
OPTION_LABEL_LIMIT = 200
OPTION_DETAIL_LIMIT = 500
ANSWER_LIMIT = 2000
OPEN_QUESTIONS_PER_ITEM = 10
MAX_DEADLINE = timedelta(days=30)
FEED_LIMIT = 100
LIST_LIMIT = 100


class Conflict(SessionError):
    """The thing asked for no longer applies: a question already answered, an item already closed."""


# ------------------------------------------------------------------ small helpers


def _need_session(session, what="reports its work"):
    if session is None:
        raise SessionError(
            f"Only an agent session {what}: register one with the bot key and use its token", forbidden=True
        )
    return session


def _text(value, name, limit, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise SessionError(f"{name} must be text")
    value = value.strip()
    if required and not value:
        raise SessionError(f"{name} is required")
    if len(value) > limit:
        raise SessionError(f"{name} is at most {limit} characters")
    return value


def _whole(value, name, low=0, high=None):
    if isinstance(value, bool) or not isinstance(value, int):
        raise SessionError(f"{name} must be a whole number")
    if value < low or (high is not None and value > high):
        raise SessionError(f"{name} must be at least {low}" if high is None else f"{name} must be from {low} to {high}")
    return value


def _link(value):
    value = _text(value, "url", URL_LIMIT)
    if value and not value.startswith(("https://", "http://")):
        raise SessionError("url must start with https:// or http://")
    return value


def identifier(issue):
    return f"{issue.project.identifier}-{issue.sequence_id}"


def _stamp(moment):
    return f"{moment.astimezone(dt_timezone.utc):%Y-%m-%d %H:%M} UTC"


def record(issue, session, kind, text="", data=None):
    """One entry in the item's agent activity, made by ``session`` (kept by name once the session is gone)."""
    return AgentActivity.objects.create(
        project_id=issue.project_id,
        issue=issue,
        session=session,
        session_name=session.name if session is not None else "",
        kind=kind,
        text=text,
        data=data or {},
    )


def held_claim(issue, session):
    """The open claim on ``issue`` when ``session`` holds it, else a ``SessionError`` saying what to do."""
    _need_session(session)
    claim = agent_sessions.open_claim(issue)
    if claim is None or claim.session_id != session.id:
        raise SessionError(
            "Claim the work item first: its status and plan belong to the session that holds it", forbidden=True
        )
    return claim


# ------------------------------------------------------------------ status, plan, log


def set_status(issue, session, state=None, text=None):
    """Set the claim's status and its one-line text; the history keeps a status entry when either changed."""
    if state is None and text is None:
        raise SessionError("Send a status, a text, or both")
    claim = held_claim(issue, session)
    if state is not None and state not in WorkItemClaim.Status.values:
        raise SessionError("status must be one of " + ", ".join(WorkItemClaim.Status.values))
    new_text = _text(text, "text", STATUS_LIMIT) if text is not None else claim.status_text
    new_state = state if state is not None else claim.status
    changed = (new_state, new_text) != (claim.status, claim.status_text)
    claim.status, claim.status_text, claim.status_at = new_state, new_text, timezone.now()
    claim.save(update_fields=["status", "status_text", "status_at", "updated_at"])
    if changed:
        record(issue, session, AgentActivity.Kind.STATUS, new_text, {"state": new_state})
    return claim


def clean_plan(steps, current=None):
    """The plan as stored: a list of ``{"title", "state"}``. A step with no state of its own is ``done`` before the
    ``current`` step (counted from 1), ``doing`` at it and ``todo`` after; past the last step, all are done."""
    if not isinstance(steps, list) or not steps:
        raise SessionError("steps must be a list of steps")
    if len(steps) > PLAN_STEPS:
        raise SessionError(f"A plan has at most {PLAN_STEPS} steps")
    current = _whole(current, "current") if current is not None else 0
    plan = []
    for number, step in enumerate(steps, start=1):
        explicit = None
        if isinstance(step, dict):
            title, explicit = step.get("title"), step.get("state")
            if explicit is not None and explicit not in PLAN_STATES:
                raise SessionError("A step's state must be one of " + ", ".join(PLAN_STATES))
        else:
            title = step
        title = _text(title, "A step's title", PLAN_STEP_LIMIT, required=True)
        state = explicit or ("done" if number < current else "doing" if number == current else "todo")
        plan.append({"title": title, "state": state})
    return plan


def set_plan(issue, session, steps, current=None):
    """Replace the claim's plan checklist; the history keeps a plan entry when it changed."""
    claim = held_claim(issue, session)
    plan = clean_plan(steps, current)
    if plan != claim.plan:
        claim.plan = plan
        claim.save(update_fields=["plan", "updated_at"])
        summary = plan_summary(plan)
        if summary["current"]:
            words = f"Step {summary['done'] + 1} of {summary['total']}: {summary['current']}"
        else:
            words = f"{summary['done']} of {summary['total']} steps done"
        record(issue, session, AgentActivity.Kind.PLAN, words, {"steps": plan})
    return claim


def log(issue, session, kind, text, ref=None, url=None):
    """Add a progress note, an error, or a link to a commit or pull request to the item's agent activity."""
    _need_session(session)
    if kind not in LOG_KINDS:
        raise SessionError("kind must be one of " + ", ".join(LOG_KINDS))
    text = _text(text, "text", TEXT_LIMIT, required=True)
    data = {"ref": _text(ref, "ref", REF_LIMIT), "url": _link(url)}
    return record(issue, session, kind, text, {key: value for key, value in data.items() if value})


def request_review(issue, session, text="", origin=None, actor=None):
    """Finish into Review: the item moves to the project's Review state and waits for a person to close it (D28)."""
    _need_session(session)
    text = _text(text, "text", TEXT_LIMIT)
    if issue.state_id and issue.state.group in CLOSED_GROUPS:
        raise Conflict("This work item is already closed")
    review = review_state(issue.project_id)
    previous = str(issue.state_id) if issue.state_id else None
    moved = previous != str(review.id)
    if moved:
        issue.state = review
        issue.save()
        _announce_state_change(issue, previous, review, actor, origin)
    claim = agent_sessions.open_claim(issue)
    if claim is not None and claim.session_id == session.id:
        claim.status = WorkItemClaim.Status.WAITING_FOR_REVIEW
        claim.status_text = (text or "Waiting for review")[:STATUS_LIMIT]
        claim.status_at = timezone.now()
        claim.save(update_fields=["status", "status_text", "status_at", "updated_at"])
    record(issue, session, AgentActivity.Kind.REVIEW, text, {"state_id": str(review.id), "moved": moved})
    return review, moved


def _announce_state_change(issue, previous, review, actor, origin):
    """Tell the item's activity feed, notifications and webhooks about the move, as a state edit through the API
    would."""
    # Imported here: the tasks need the models and these utilities are imported by models' signals
    from plane.bgtasks.issue_activities_task import issue_activity
    from plane.bgtasks.webhook_task import model_activity

    if actor is None:
        return
    current = json.dumps({"state_id": previous}, cls=DjangoJSONEncoder)
    requested = {"state_id": str(review.id)}
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps(requested, cls=DjangoJSONEncoder),
        actor_id=str(actor.id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=current,
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=origin,
    )
    model_activity.delay(
        model_name="issue",
        model_id=str(issue.id),
        requested_data=requested,
        current_instance=current,
        actor_id=actor.id,
        slug=issue.workspace.slug,
        origin=origin,
    )


# ------------------------------------------------------------------ questions


def _options(options):
    if options is None:
        return []
    if not isinstance(options, list) or len(options) > OPTIONS_MAX:
        raise SessionError(f"options must be a list of at most {OPTIONS_MAX}")
    cleaned = []
    for option in options:
        if isinstance(option, dict):
            label, detail = option.get("label"), option.get("detail")
        else:
            label, detail = option, None
        cleaned.append(
            {
                "label": _text(label, "An option's label", OPTION_LABEL_LIMIT, required=True),
                "detail": _text(detail, "An option's detail", OPTION_DETAIL_LIMIT),
            }
        )
    return cleaned


def _deadline(deadline, minutes):
    now = timezone.now()
    if deadline not in (None, ""):
        if not isinstance(deadline, str):
            raise SessionError("deadline must be a date and time, such as 2026-10-16T18:00:00Z")
        try:
            moment = datetime.fromisoformat(deadline.strip().replace("Z", "+00:00"))
        except ValueError:
            raise SessionError("deadline must be a date and time, such as 2026-10-16T18:00:00Z")
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=dt_timezone.utc)
    elif minutes:
        moment = now + timedelta(minutes=_whole(minutes, "deadline_minutes", low=1))
    else:
        return None
    if moment <= now:
        raise SessionError("The deadline is in the past")
    if moment > now + MAX_DEADLINE:
        raise SessionError(f"The deadline is at most {MAX_DEADLINE.days} days away")
    return moment


def ask(issue, session, question, options=None, detail="", default=None, deadline=None, deadline_minutes=None):
    """Put a question on the item and wait for an answer. ``default`` is the number (from 1) of the option that
    applies when nobody answers by ``deadline``."""
    _need_session(session, "asks questions")
    if session.status == AgentSession.Status.ENDED:
        raise SessionError("This agent session has ended", forbidden=True)
    question = _text(question, "question", QUESTION_LIMIT, required=True)
    detail = _text(detail, "detail", DETAIL_LIMIT)
    options = _options(options)
    if default in (None, ""):
        default = None
    elif not options:
        raise SessionError("default names an option: give options first")
    else:
        default = _whole(default, "default", low=1, high=len(options))
    moment = _deadline(deadline, deadline_minutes)
    if AgentQuestion.objects.filter(issue=issue, status=AgentQuestion.Status.OPEN).count() >= OPEN_QUESTIONS_PER_ITEM:
        raise SessionError(f"This work item already has {OPEN_QUESTIONS_PER_ITEM} open questions", forbidden=True)
    return AgentQuestion.objects.create(
        project_id=issue.project_id,
        issue=issue,
        session=session,
        session_name=session.name,
        bot=session.bot,
        question=question,
        detail=detail,
        options=options,
        default_option=default,
        deadline=moment,
    )


def _choice(question, number, text=""):
    """The answer as words for the session: the option's number, label and detail, then any text."""
    parts = []
    if number:
        option = question.options[number - 1]
        parts.append(f"{number}. {option['label']}" + (f" ({option['detail']})" if option["detail"] else ""))
    if text:
        parts.append(text)
    return "\n".join(parts)


def _send_answer(question, issue, words, data, actor=None, stamp=None):
    """Put the answer in the asking session's inbox, or in its bot's queue once that session has ended."""
    session = question.session
    if session is not None and session.status == AgentSession.Status.ENDED:
        session = None
    return agent_inbox.deliver(
        workspace_id=question.workspace_id,
        bot=question.bot,
        session=session,
        kind=AgentInboxMessage.Kind.ANSWER,
        dedupe_key=f"answer:{question.id}:{data['source']}:{stamp or timezone.now().timestamp()}",
        issue=issue,
        actor=actor,
        body=words,
        data={
            "question_id": str(question.id),
            "identifier": identifier(issue),
            "issue_id": str(issue.id),
            "project_id": str(issue.project_id),
            "to": "session" if session is not None else "queue",
            **data,
        },
    )


def answer(question, user, option=None, text=""):
    """A person answers: by an option's number, in their own words, or both. Allowed while the question is open, and
    after the deadline passed (the session gets it as a correction)."""
    if getattr(user, "is_bot", False):
        raise SessionError("Only a person answers a question", forbidden=True)
    if option is not None:
        if not question.options:
            raise SessionError("This question has no options: write an answer")
        option = _whole(option, "option", low=1, high=len(question.options))
    text = _text(text, "text", ANSWER_LIMIT)
    if option is None and not text:
        raise SessionError("Pick an option or write an answer")
    with transaction.atomic():
        locked = (
            AgentQuestion.objects.select_for_update(of=("self",))
            .select_related("issue__project", "bot", "session")
            .get(pk=question.pk)
        )
        if locked.status not in (
            AgentQuestion.Status.OPEN,
            AgentQuestion.Status.DEFAULTED,
            AgentQuestion.Status.EXPIRED,
        ):
            raise Conflict(f"This question is {locked.get_status_display().lower()}")
        correction = locked.status != AgentQuestion.Status.OPEN
        lapsed = locked.status
        now = timezone.now()
        locked.status = AgentQuestion.Status.ANSWERED
        locked.answered_at, locked.answered_by = now, user
        locked.answer_option, locked.answer_text = option, text
        locked.answer_source = AgentQuestion.Source.HUMAN
        locked.save(
            update_fields=[
                "status",
                "answered_at",
                "answered_by",
                "answer_option",
                "answer_text",
                "answer_source",
                "updated_at",
            ]
        )
        issue = locked.issue
        who = user.display_name or "Someone"
        head = f"{who} answered your question on {identifier(issue)}: {locked.question}"
        if correction:
            outcome = "the default applied" if lapsed == AgentQuestion.Status.DEFAULTED else "the deadline passed"
            head = (
                f"{who} answered your question on {identifier(issue)} after {outcome}: {locked.question}\n\n"
                "Treat this as a correction."
            )
        _send_answer(
            locked,
            issue,
            f"{head}\n\nAnswer: {_choice(locked, option, text)}",
            {
                "source": "human",
                "option": option,
                "option_label": locked.options[option - 1]["label"] if option else None,
                "text": text,
                "correction": correction,
            },
            actor=user,
            stamp=now.timestamp(),
        )
    return locked


def cancel(question, session=None):
    """Withdraw an open question: the session that asked it, or a person (``session`` is None)."""
    if session is not None and question.session_id != session.id:
        raise SessionError("This question was asked by another session", forbidden=True)
    if question.status != AgentQuestion.Status.OPEN:
        raise Conflict(f"This question is {question.get_status_display().lower()}")
    question.status = AgentQuestion.Status.CANCELLED
    question.save(update_fields=["status", "updated_at"])
    return question


def apply_deadline(question, now=None):
    """The deadline of an open question has passed: the default applies, or the question lapses when it has none.
    The session is told either way. Returns whether anything changed."""
    now = now or timezone.now()
    with transaction.atomic():
        locked = (
            AgentQuestion.objects.select_for_update(of=("self",))
            .select_related("issue__project", "bot", "session")
            .get(pk=question.pk)
        )
        if locked.status != AgentQuestion.Status.OPEN or locked.deadline is None or locked.deadline > now:
            return False
        issue = locked.issue
        locked.lapsed_at = now
        base = f"Nobody answered your question on {identifier(issue)} by {_stamp(locked.deadline)}: {locked.question}"
        if locked.default_option:
            locked.status = AgentQuestion.Status.DEFAULTED
            locked.answer_option = locked.default_option
            locked.answer_source = AgentQuestion.Source.DEFAULT
            words = (
                f"{base}\n\nThe default applies: {_choice(locked, locked.default_option)}\n\n"
                "Carry on with it. An answer from a person that comes later reaches you as a correction."
            )
            data = {
                "source": "default",
                "option": locked.default_option,
                "option_label": locked.options[locked.default_option - 1]["label"],
                "text": "",
                "correction": False,
            }
        else:
            locked.status = AgentQuestion.Status.EXPIRED
            words = f"{base}\n\nThere is no default: decide yourself, or ask again."
            data = {"source": "expired", "option": None, "option_label": None, "text": "", "correction": False}
        locked.save(update_fields=["status", "lapsed_at", "answer_option", "answer_source", "updated_at"])
        _send_answer(locked, issue, words, data, stamp=now.timestamp())
    return True


def sweep_questions(now=None):
    """Apply the deadline of every open question that has passed it; returns how many changed."""
    now = now or timezone.now()
    due = AgentQuestion.objects.filter(status=AgentQuestion.Status.OPEN, deadline__lte=now)
    return sum(1 for question in due.order_by("deadline")[:200] if apply_deadline(question, now))


# ------------------------------------------------------------------ what the APIs show


def _person(user):
    return {"id": str(user.id), "display_name": user.display_name} if user is not None else None


def _session_ref(session, name):
    if session is not None:
        return session_lite(session)
    return {"id": None, "name": name, "status": "ended", "harness": None, "bot": None} if name else None


def question_data(question):
    issue = question.issue
    return {
        "id": str(question.id),
        "work_item": {
            "id": str(issue.id),
            "project_id": str(issue.project_id),
            "identifier": identifier(issue),
            "name": issue.name,
        },
        "session": _session_ref(question.session, question.session_name),
        "question": question.question,
        "detail": question.detail,
        "options": question.options,
        "default_option": question.default_option,
        "deadline": question.deadline,
        "status": question.status,
        "asked_at": question.created_at,
        "lapsed_at": question.lapsed_at,
        "answered_at": question.answered_at,
        "answered_by": _person(question.answered_by),
        "answer_option": question.answer_option,
        "answer_text": question.answer_text,
        "answer_source": question.answer_source,
        # A person answered after the deadline had passed
        "corrected": question.status == AgentQuestion.Status.ANSWERED and question.lapsed_at is not None,
    }


def questions_for(issue, status=None):
    questions = AgentQuestion.objects.filter(issue=issue).select_related(
        "issue__project", "session__bot__user", "answered_by"
    )
    if status:
        questions = questions.filter(status__in=status.split(","))
    return questions


def activity_data(entry):
    return {
        "id": str(entry.id),
        "kind": entry.kind,
        "text": entry.text,
        "data": entry.data,
        "session": _session_ref(entry.session, entry.session_name),
        "created_at": entry.created_at,
    }


def activity_for(issue, kind=None):
    entries = AgentActivity.objects.filter(issue=issue).select_related("session__bot__user")
    if kind:
        entries = entries.filter(kind__in=kind.split(","))
    return entries


def overview(issue):
    """Everything the item's Agent tab shows: the open claim with its status and plan, the questions (open ones
    first), and the typed activity, newest first."""
    claim = agent_sessions.open_claim(issue)
    questions = list(questions_for(issue)[:LIST_LIMIT])
    questions.sort(key=lambda q: (q.status != AgentQuestion.Status.OPEN, -q.created_at.timestamp()))
    return {
        "claim": {**_claim_ref(claim), **claim_progress(claim)} if claim is not None else None,
        "awaiting_input": any(question.status == AgentQuestion.Status.OPEN for question in questions),
        "questions": [question_data(question) for question in questions],
        "activity": [activity_data(entry) for entry in activity_for(issue)[:FEED_LIMIT]],
    }


def _claim_ref(claim):
    session = claim.session
    return {
        "id": str(claim.id),
        "label": agent_sessions.claim_label(claim),
        "session": session_lite(session),
        "claimed_at": claim.claimed_at,
    }


def awaiting_input(**filters):
    """Per item with an open question (narrowed by ``filters``): the first one's id, text and deadline."""
    found = {}
    for question in AgentQuestion.objects.filter(status=AgentQuestion.Status.OPEN, **filters).order_by("created_at"):
        found.setdefault(
            str(question.issue_id),
            {"id": str(question.id), "question": question.question, "deadline": question.deadline},
        )
    return found


# ------------------------------------------------------------------ the sessions' state, for the Agents page

STATE_ORDER = ("blocked", "awaiting_input", "waiting_for_review", "working")


def session_states(sessions):
    """Per session id: its state (away or ended, else the most pressing of blocked, awaiting input, waiting for
    review and working) and where its plan stands, from the claims it holds and the questions it has open."""
    ids = [session.id for session in sessions]
    claims = {}
    for claim in WorkItemClaim.objects.filter(session_id__in=ids, ended_at__isnull=True).order_by("claimed_at"):
        claims.setdefault(claim.session_id, []).append(claim)
    asking = set(
        AgentQuestion.objects.filter(session_id__in=ids, status=AgentQuestion.Status.OPEN).values_list(
            "session_id", flat=True
        )
    )
    result = {}
    for session in sessions:
        held = claims.get(session.id, [])
        states = {claim.status for claim in held}
        if session.id in asking:
            states.add("awaiting_input")
        if session.status != AgentSession.Status.LIVE:
            state = session.status
        else:
            state = next((name for name in STATE_ORDER if name in states), "working")
        stepped = next((claim for claim in reversed(held) if claim.plan), None)
        result[session.id] = {
            "state": state,
            "status_text": next((claim.status_text for claim in reversed(held) if claim.status_text), ""),
            "plan": plan_summary(stepped.plan) if stepped else None,
        }
    return result


# ------------------------------------------------------------------ needs you


def needs_you(slug, visible):
    """The open questions and the items in Review, from the projects the viewer is in, newest first."""
    questions = list(
        AgentQuestion.objects.filter(
            workspace__slug=slug,
            project_id__in=visible,
            status=AgentQuestion.Status.OPEN,
            issue__deleted_at__isnull=True,
        )
        .select_related("issue__project", "session__bot__user", "answered_by")
        .order_by("-created_at")[:LIST_LIMIT]
    )
    reviewing = list(
        Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id__in=visible,
            state__state_group__key="review",
            state__state_group__deleted_at__isnull=True,
        )
        .select_related("project", "state")
        .order_by("-updated_at")[:LIST_LIMIT]
    )
    moves = {}
    for entry in (
        IssueActivity.objects.filter(
            issue_id__in=[issue.id for issue in reviewing],
            field="state",
            new_identifier__in=[str(issue.state_id) for issue in reviewing],
        )
        .select_related("agent_session__bot__user")
        .order_by("created_at")
    ):
        moves[entry.issue_id] = entry
    notes = {}
    for entry in AgentActivity.objects.filter(
        issue_id__in=[issue.id for issue in reviewing], kind=AgentActivity.Kind.REVIEW
    ).order_by("created_at"):
        notes[entry.issue_id] = entry
    reviews = []
    for issue in reviewing:
        move, note = moves.get(issue.id), notes.get(issue.id)
        session = move.agent_session if move is not None else None
        reviews.append(
            {
                "work_item": {
                    "id": str(issue.id),
                    "project_id": str(issue.project_id),
                    "identifier": identifier(issue),
                    "name": issue.name,
                },
                "session": session_lite(session)
                if session is not None
                else (_session_ref(None, note.session_name) if note is not None else None),
                "summary": note.text if note is not None else "",
                "at": move.created_at if move is not None else issue.updated_at,
            }
        )
    reviews.sort(key=lambda entry: entry["at"], reverse=True)
    return {
        "questions": [question_data(question) for question in questions],
        "reviews": reviews,
        "counts": {"questions": len(questions), "reviews": len(reviews), "total": len(questions) + len(reviews)},
    }
