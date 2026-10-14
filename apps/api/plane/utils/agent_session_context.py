# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Which agent session the code is acting for, in a request and in the tasks it queues.

In a request the session comes from its token (``APIKeyAuthentication`` puts it on the request crum holds).
The activity task runs in the worker, where the request is gone: rather than teach every call site of
``issue_activity.delay`` about sessions, the publisher stamps ``agent_session_id`` into the task's
arguments, and the task runs inside ``acting_as``. Models read ``active_session_id`` when they are created.
Imported by ``plane.celery`` and by models, so it must not import models.
"""

import contextvars
from contextlib import contextmanager

from celery.signals import before_task_publish
from crum import get_current_request

ATTRIBUTED_TASKS = frozenset({"plane.bgtasks.issue_activities_task.issue_activity"})

_task_session = contextvars.ContextVar("agent_session_id", default=None)


def active_session_id():
    """The agent session being acted for: the request's, or the one a task was queued under."""
    request = get_current_request()
    session = getattr(request, "agent_session", None) if request is not None else None
    if session is not None:
        return session.id
    return _task_session.get()


@contextmanager
def acting_as(session_id):
    token = _task_session.set(session_id or None)
    try:
        yield
    finally:
        _task_session.reset(token)


def stamp_agent_session(sender=None, body=None, **kwargs):
    if sender not in ATTRIBUTED_TASKS:
        return
    session_id = active_session_id()
    if session_id is None:
        return
    # Protocol 2 bodies are (args, kwargs, embed); the body is serialized after this signal
    task_kwargs = body[1] if isinstance(body, (tuple, list)) and len(body) > 1 else None
    if isinstance(task_kwargs, dict) and not task_kwargs.get("agent_session_id"):
        task_kwargs["agent_session_id"] = str(session_id)


before_task_publish.connect(stamp_agent_session, dispatch_uid="plane.stamp_agent_session")
