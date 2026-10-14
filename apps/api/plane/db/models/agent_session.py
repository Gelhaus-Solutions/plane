# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

from .base import BaseModel


class AgentSession(BaseModel):
    """One session of an agent harness, working through its harness bot.

    The bot (a ``WorkspaceBot``, one per harness: Claude, Codex, GArness) is the static identity with
    memberships and a key. Sessions come and go underneath it: each registers with the bot key and gets a
    token of its own, so every write is traceable to the session that made it.
    """

    class Harness(models.TextChoices):
        CLAUDE_CODE = "claude-code", "Claude Code"
        CODEX = "codex", "Codex"
        GARNESS = "garness", "GArness"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        LIVE = "live", "Live"
        AWAY = "away", "Away"
        ENDED = "ended", "Ended"

    bot = models.ForeignKey("db.WorkspaceBot", on_delete=models.CASCADE, related_name="sessions")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="agent_sessions")
    harness = models.CharField(max_length=32, choices=Harness.choices)
    # The harness's own session id; with bot and harness it identifies the session, so a resume reopens it
    external_id = models.CharField(max_length=255)
    generation = models.PositiveIntegerField(default=0)
    # The agent bus name, `<scope>@<first 8 of the session id>`, so people and the bus address the same thing
    name = models.CharField(max_length=255)
    primary_dir = models.TextField(blank=True)
    host = models.CharField(max_length=255, blank=True)
    git_branch = models.CharField(max_length=255, blank=True)
    model = models.CharField(max_length=255, blank=True)
    harness_version = models.CharField(max_length=64, blank=True)
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.LIVE)
    started_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=64, blank=True)

    class Meta:
        verbose_name = "Agent Session"
        verbose_name_plural = "Agent Sessions"
        db_table = "agent_sessions"
        ordering = ("-last_seen_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["bot", "harness", "external_id"],
                condition=Q(deleted_at__isnull=True),
                name="agent_session_unique_external_id",
            )
        ]
        indexes = [models.Index(fields=["workspace", "status", "last_seen_at"], name="agent_session_status_idx")]

    def __str__(self):
        return f"{self.name} ({self.status})"
