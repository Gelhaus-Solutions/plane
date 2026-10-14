# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Epics (E11): a work item of the project's Epic type, with its own lead, size, wave and status updates."""

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class EpicSize(models.TextChoices):
    XS = "XS", "XS"
    S = "S", "S"
    M = "M", "M"
    L = "L", "L"
    XL = "XL", "XL"


class EpicHealth(models.TextChoices):
    ON_TRACK = "on_track", "On track"
    AT_RISK = "at_risk", "At risk"
    OFF_TRACK = "off_track", "Off track"


class EpicWave(ProjectBaseModel):
    """A wave of a project's epics: a short code (W1) and a theme (Priorities), in order."""

    code = models.CharField(max_length=16)
    name = models.CharField(max_length=255, blank=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["project", "code", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "code"],
                condition=Q(deleted_at__isnull=True),
                name="epic_wave_unique_project_code_when_deleted_at_null",
            )
        ]
        verbose_name = "Epic Wave"
        verbose_name_plural = "Epic Waves"
        db_table = "epic_waves"
        ordering = ("sort_order", "code")

    def __str__(self):
        return f"{self.code} {self.name}".strip()


class EpicDetail(ProjectBaseModel):
    """The fields only an epic has. One row per epic, made when one of them is first set."""

    epic = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="epic_details")
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="led_epics"
    )
    size = models.CharField(max_length=4, choices=EpicSize.choices, null=True, blank=True)
    wave = models.ForeignKey(EpicWave, on_delete=models.SET_NULL, null=True, blank=True, related_name="epics")

    class Meta:
        unique_together = ["epic", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["epic"],
                condition=Q(deleted_at__isnull=True),
                name="epic_detail_unique_epic_when_deleted_at_null",
            )
        ]
        verbose_name = "Epic Detail"
        verbose_name_plural = "Epic Details"
        db_table = "epic_details"

    def __str__(self):
        return f"{self.epic_id} details"


class EpicUpdate(ProjectBaseModel):
    """A status update posted on an epic: its health and a short note. The latest one is the epic's health."""

    epic = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="epic_updates")
    health = models.CharField(max_length=16, choices=EpicHealth.choices)
    body = models.TextField(blank=True)

    class Meta:
        verbose_name = "Epic Update"
        verbose_name_plural = "Epic Updates"
        db_table = "epic_updates"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.epic_id} {self.health}"
