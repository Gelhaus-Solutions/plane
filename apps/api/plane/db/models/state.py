# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.template.defaultfilters import slugify
from django.db.models import Q

# Module imports
from .base import BaseModel
from .project import ProjectBaseModel
from plane.db.mixins import SoftDeletionManager


class StateGroup(models.TextChoices):
    BACKLOG = "backlog", "Backlog"
    UNSTARTED = "unstarted", "Unstarted"
    STARTED = "started", "Started"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    TRIAGE = "triage", "Triage"


# The categories a state group sits in; they drive progress, cycles and archiving. Triage is not one of them.
STATE_CATEGORIES = [(group.value, group.label) for group in StateGroup if group != StateGroup.TRIAGE]

# Every workspace has these groups: one per category, plus Review in the started category (D30, D36)
BUILTIN_STATE_GROUPS = [
    {"key": "backlog", "name": "Backlog", "category": "backlog", "color": "#60646C", "sequence": 15000},
    {"key": "unstarted", "name": "Unstarted", "category": "unstarted", "color": "#60646C", "sequence": 25000},
    {"key": "started", "name": "Started", "category": "started", "color": "#F59E0B", "sequence": 35000},
    {"key": "review", "name": "Review", "category": "started", "color": "#8B5CF6", "sequence": 40000},
    {"key": "completed", "name": "Completed", "category": "completed", "color": "#46A758", "sequence": 45000},
    {"key": "cancelled", "name": "Cancelled", "category": "cancelled", "color": "#9AA4BC", "sequence": 55000},
]


# Default states
DEFAULT_STATES = [
    {
        "name": "Backlog",
        "color": "#60646C",
        "sequence": 15000,
        "group": StateGroup.BACKLOG.value,
        "default": True,
    },
    {
        "name": "Todo",
        "color": "#60646C",
        "sequence": 25000,
        "group": StateGroup.UNSTARTED.value,
    },
    {
        "name": "In Progress",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Review",
        "color": "#8B5CF6",
        "sequence": 40000,
        "group": StateGroup.STARTED.value,
        "state_group": "review",
    },
    {
        "name": "Done",
        "color": "#46A758",
        "sequence": 45000,
        "group": StateGroup.COMPLETED.value,
    },
    {
        "name": "Cancelled",
        "color": "#9AA4BC",
        "sequence": 55000,
        "group": StateGroup.CANCELLED.value,
    },
    {
        "name": "Triage",
        "color": "#4E5355",
        "sequence": 65000,
        "group": StateGroup.TRIAGE.value,
    },
]


class WorkspaceStateGroup(BaseModel):
    """A state group of a workspace (E30).

    Each group sits in one of the five categories. The built-in groups (BUILTIN_STATE_GROUPS) carry a key and cannot
    be deleted; workspaces add their own. A state's ``group`` always holds its state group's category (D36), so
    everything that reads the category keeps working, and only what shows or filters by group reads these rows.
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="state_groups")
    name = models.CharField(max_length=255)
    key = models.CharField(max_length=32, null=True, blank=True)
    category = models.CharField(max_length=20, choices=STATE_CATEGORIES)
    color = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    sequence = models.FloatField(default=65535)
    is_builtin = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workspace State Group"
        verbose_name_plural = "Workspace State Groups"
        db_table = "workspace_state_groups"
        ordering = ("sequence",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="state_group_unique_name_when_deleted_at_null",
            ),
            models.UniqueConstraint(
                fields=["workspace", "key"],
                condition=Q(deleted_at__isnull=True, key__isnull=False),
                name="state_group_unique_key_when_deleted_at_null",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.category})"


class StateManager(SoftDeletionManager):
    """Default manager - excludes triage states"""

    def get_queryset(self):
        return super().get_queryset().exclude(group=StateGroup.TRIAGE.value)


class TriageStateManager(SoftDeletionManager):
    """Manager for triage states only"""

    def get_queryset(self):
        return super().get_queryset().filter(group=StateGroup.TRIAGE.value)


class State(ProjectBaseModel):
    name = models.CharField(max_length=255, verbose_name="State Name")
    description = models.TextField(verbose_name="State Description", blank=True)
    color = models.CharField(max_length=255, verbose_name="State Color")
    slug = models.SlugField(max_length=100, blank=True)
    sequence = models.FloatField(default=65535)
    group = models.CharField(
        choices=StateGroup.choices,
        default=StateGroup.BACKLOG,
        max_length=20,
    )
    is_triage = models.BooleanField(default=False)
    default = models.BooleanField(default=False)
    # The workspace state group; ``group`` above is always its category. Triage states have none.
    state_group = models.ForeignKey(
        "db.WorkspaceStateGroup", on_delete=models.SET_NULL, null=True, blank=True, related_name="states"
    )
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    objects = StateManager()
    all_state_objects = models.Manager()
    triage_objects = TriageStateManager()

    def __str__(self):
        """Return name of the state"""
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="state_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "State"
        verbose_name_plural = "States"
        db_table = "states"
        ordering = ("sequence",)

    _loaded_state_group_id = None

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        instance._loaded_state_group_id = instance.__dict__.get("state_group_id")
        return instance

    def sync_state_group(self):
        """Keep ``group`` and ``state_group`` in step. A state group set or changed here wins and sets the
        category; otherwise a changed category moves the state to that category's built-in group."""
        if self.group == StateGroup.TRIAGE.value:
            self.state_group = None
            return
        if self.state_group_id and (
            self.state_group_id != self._loaded_state_group_id or self.state_group.category == self.group
        ):
            self.group = self.state_group.category
            return
        from plane.utils.state_groups import builtin_state_groups

        self.state_group = builtin_state_groups(self.workspace_id or self.project.workspace_id)[self.group]

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        self.sync_state_group()
        if self._state.adding:
            # Get the maximum sequence value from the database
            last_id = State.objects.filter(project=self.project).aggregate(largest=models.Max("sequence"))["largest"]
            # if last_id is not None
            if last_id is not None:
                self.sequence = last_id + 15000

        return super().save(*args, **kwargs)
