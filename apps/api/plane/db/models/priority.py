# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

from .base import BaseModel

# The five levels sorting, PQL, analytics and the API know; every priority sits at one of them (D38)
PRIORITY_LEVELS = [
    ("urgent", "Urgent"),
    ("high", "High"),
    ("medium", "Medium"),
    ("low", "Low"),
    ("none", "None"),
]
LEVEL_RANK = {level: rank for rank, (level, _) in enumerate(PRIORITY_LEVELS)}

BUILTIN_PRIORITIES = [
    {"key": "urgent", "name": "Urgent", "level": "urgent", "color": "#EF4444", "sequence": 10000},
    {"key": "high", "name": "High", "level": "high", "color": "#F97316", "sequence": 20000},
    {"key": "medium", "name": "Medium", "level": "medium", "color": "#EAB308", "sequence": 30000},
    {"key": "low", "name": "Low", "level": "low", "color": "#22C55E", "sequence": 40000},
    {"key": "none", "name": "None", "level": "none", "color": "#A3A3A3", "sequence": 50000},
]


class WorkspacePriority(BaseModel):
    """A priority of a workspace (E35).

    Each sits at one of the five levels. A work item keeps the level in ``priority`` and names a custom priority in
    ``priority_option``; an item without one shows its level's built-in priority, so nothing had to be backfilled.
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="priorities")
    name = models.CharField(max_length=255)
    key = models.CharField(max_length=32, null=True, blank=True)
    level = models.CharField(max_length=30, choices=PRIORITY_LEVELS)
    color = models.CharField(max_length=255, blank=True)
    icon = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    sequence = models.FloatField(default=65535)
    is_builtin = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workspace Priority"
        verbose_name_plural = "Workspace Priorities"
        db_table = "workspace_priorities"
        ordering = ("sequence",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="priority_unique_name_when_deleted_at_null",
            ),
            models.UniqueConstraint(
                fields=["workspace", "key"],
                condition=Q(deleted_at__isnull=True, key__isnull=False),
                name="priority_unique_key_when_deleted_at_null",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.level})"
