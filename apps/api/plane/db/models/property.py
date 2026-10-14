# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Custom work item properties (E10 items 1 and 2, pulled forward by D39).

A property belongs to the workspace and applies to every work item in it; work item types attach to properties later
(E10). Each value is one row in the column for its kind, so PQL ``cf[...]`` filters on indexed columns (text is not
indexed: a long text would not fit a btree row); a property that takes several values has several rows.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from .base import BaseModel


class PropertyType(models.TextChoices):
    TEXT = "TEXT", "Text"
    DATETIME = "DATETIME", "Date"
    DECIMAL = "DECIMAL", "Number"
    BOOLEAN = "BOOLEAN", "Checkbox"
    OPTION = "OPTION", "Option"
    RELATION = "RELATION", "Relation"
    URL = "URL", "URL"
    EMAIL = "EMAIL", "Email"


class RelationType(models.TextChoices):
    USER = "USER", "Member"
    ISSUE = "ISSUE", "Work item"


class WorkItemProperty(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="work_item_properties")
    display_name = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    property_type = models.CharField(max_length=20, choices=PropertyType.choices)
    relation_type = models.CharField(max_length=20, choices=RelationType.choices, null=True, blank=True)
    is_multi = models.BooleanField(default=False)
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Values in the property's own type, as the API takes them (a list for a multi-value property)
    default_value = models.JSONField(null=True, blank=True)
    display_format = models.CharField(max_length=64, blank=True)
    sequence = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Work Item Property"
        verbose_name_plural = "Work Item Properties"
        db_table = "work_item_properties"
        ordering = ("sequence", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="work_item_property_unique_name_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.display_name} ({self.property_type})"


class WorkItemPropertyOption(BaseModel):
    property = models.ForeignKey(WorkItemProperty, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=255, blank=True)
    is_default = models.BooleanField(default=False)
    sequence = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Work Item Property Option"
        verbose_name_plural = "Work Item Property Options"
        db_table = "work_item_property_options"
        ordering = ("sequence", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["property", "name"],
                condition=Q(deleted_at__isnull=True),
                name="work_item_property_option_unique_name_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return self.name


class WorkItemPropertyValue(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="work_item_property_values")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="property_values")
    property = models.ForeignKey(WorkItemProperty, on_delete=models.CASCADE, related_name="values")
    value_text = models.TextField(null=True, blank=True)
    value_decimal = models.DecimalField(max_digits=30, decimal_places=10, null=True, blank=True)
    value_datetime = models.DateTimeField(null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    value_option = models.ForeignKey(
        WorkItemPropertyOption, on_delete=models.CASCADE, null=True, blank=True, related_name="values"
    )
    value_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    value_issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, null=True, blank=True, related_name="+")

    class Meta:
        verbose_name = "Work Item Property Value"
        verbose_name_plural = "Work Item Property Values"
        db_table = "work_item_property_values"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["issue", "property"], name="wipv_issue_property_idx"),
            models.Index(fields=["property", "value_decimal"], name="wipv_property_decimal_idx"),
            models.Index(fields=["property", "value_datetime"], name="wipv_property_datetime_idx"),
            models.Index(fields=["property", "value_option"], name="wipv_property_option_idx"),
            models.Index(fields=["property", "value_user"], name="wipv_property_user_idx"),
        ]

    def __str__(self):
        return f"{self.property_id} on {self.issue_id}"
