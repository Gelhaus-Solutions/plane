# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

from .base import BaseModel

DASHBOARD_ACCESS = [("private", "Private"), ("workspace", "Workspace")]
# 2 weeks count per day, 6 weeks and a quarter per week
DASHBOARD_PERIODS = [("2w", "2 weeks"), ("6w", "6 weeks"), ("quarter", "Quarter")]
WIDGET_CHARTS = [
    ("number", "Number"),
    ("line", "Line"),
    ("bars", "Stacked bars"),
    ("rows", "Bars by row"),
    ("list", "List"),
    ("table", "Table"),
]


class Dashboard(BaseModel):
    """A workspace dashboard of PQL widgets (E23).

    A private dashboard is its owner's alone. A workspace dashboard every member sees and can duplicate; its owner and
    the workspace's admins edit it (D47). Each viewer sees the numbers of the projects they are a member of, narrowed
    by the dashboard's projects and query, which every widget's query is joined to with AND.
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="custom_dashboards")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="dashboards")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    access = models.CharField(max_length=16, choices=DASHBOARD_ACCESS, default="private")
    period = models.CharField(max_length=16, choices=DASHBOARD_PERIODS, default="6w")
    project_ids = models.JSONField(default=list, blank=True)
    pql = models.TextField(blank=True)

    class Meta:
        verbose_name = "Dashboard"
        verbose_name_plural = "Dashboards"
        db_table = "dashboards"
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class DashboardWidget(BaseModel):
    """A widget: a PQL query, a chart and its settings, and its place on the dashboard's twelve columns."""

    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name="widgets")
    title = models.CharField(max_length=255)
    chart = models.CharField(max_length=16, choices=WIDGET_CHARTS)
    pql = models.TextField(blank=True)
    # measure, x_axis, split_by, sort and the switches; see plane.utils.dashboard_data
    config = models.JSONField(default=dict, blank=True)
    sort_order = models.FloatField(default=65535)
    width = models.PositiveSmallIntegerField(default=6)
    height = models.PositiveSmallIntegerField(default=7)

    class Meta:
        verbose_name = "Dashboard Widget"
        verbose_name_plural = "Dashboard Widgets"
        db_table = "dashboard_widgets"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.title} <{self.dashboard_id}>"


class DashboardFavorite(BaseModel):
    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name="favorites")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="dashboard_favorites")

    class Meta:
        verbose_name = "Dashboard Favorite"
        verbose_name_plural = "Dashboard Favorites"
        db_table = "dashboard_favorites"
        constraints = [
            models.UniqueConstraint(
                fields=["dashboard", "user"],
                condition=Q(deleted_at__isnull=True),
                name="dashboard_favorite_unique_when_deleted_at_null",
            )
        ]
