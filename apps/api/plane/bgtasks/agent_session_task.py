# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging

from celery import shared_task

from plane.utils.agent_sessions import sweep
from plane.utils.agent_steering import sweep_questions

logger = logging.getLogger("plane.worker")


@shared_task
def sweep_agent_sessions():
    """Live sessions gone quiet become away; long-away sessions end and lose their tokens."""
    away, ended = sweep()
    if away or ended:
        logger.info("agent sessions swept", extra={"away": away, "ended": ended})


@shared_task
def apply_question_deadlines():
    """An agent's question whose deadline passed unanswered gets its default, and the session is told."""
    changed = sweep_questions()
    if changed:
        logger.info("agent question deadlines applied", extra={"count": changed})
