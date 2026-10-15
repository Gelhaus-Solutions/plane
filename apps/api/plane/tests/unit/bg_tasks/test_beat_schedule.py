# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Every task on the Celery beat schedule is one the worker has registered.

A worker discards a task it does not know ("Received unregistered task"), so a scheduled job whose module is missing
from CELERY_IMPORTS never runs, and nothing fails loudly. On production the agent session sweep was one: sessions
never went away, and every one of them read as live.
"""

from plane.celery import app


def test_every_scheduled_task_is_registered():
    app.loader.import_default_modules()
    missing = sorted({entry["task"] for entry in app.conf.beat_schedule.values()} - set(app.tasks))
    assert missing == [], f"scheduled but not registered in CELERY_IMPORTS: {missing}"
