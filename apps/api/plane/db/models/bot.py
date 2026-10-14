# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

from .base import BaseModel


class WorkspaceBot(BaseModel):
    """A bot account owned by one workspace.

    The bot itself is a ``User`` with ``is_bot`` set: that row carries its name and avatar,
    its workspace and project memberships (so it can be assigned and mentioned) and its API
    tokens. This row carries what only bots have. Bots never sign in; they act through tokens.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workspace_bot")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="bots")
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = "Workspace Bot"
        verbose_name_plural = "Workspace Bots"
        db_table = "workspace_bots"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user.display_name} <{self.workspace.slug}>"
