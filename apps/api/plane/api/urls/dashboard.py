# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views.dashboard import (
    DashboardChartAPIEndpoint,
    DashboardDataAPIEndpoint,
    DashboardDetailAPIEndpoint,
    DashboardDuplicateAPIEndpoint,
    DashboardListAPIEndpoint,
    DashboardWidgetDetailAPIEndpoint,
    DashboardWidgetsAPIEndpoint,
)

# Dashboards of PQL widgets (E23); layout, favourites and the editor's preview stay with the app
urlpatterns = [
    path(
        "workspaces/<str:slug>/dashboards/",
        DashboardListAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="api-dashboards",
    ),
    path(
        "workspaces/<str:slug>/dashboards/chart/",
        DashboardChartAPIEndpoint.as_view(http_method_names=["post"]),
        name="api-dashboard-chart",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/",
        DashboardDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="api-dashboard",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/duplicate/",
        DashboardDuplicateAPIEndpoint.as_view(http_method_names=["post"]),
        name="api-dashboard-duplicate",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/",
        DashboardWidgetsAPIEndpoint.as_view(http_method_names=["post"]),
        name="api-dashboard-widgets",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/<uuid:widget_id>/",
        DashboardWidgetDetailAPIEndpoint.as_view(http_method_names=["patch", "delete"]),
        name="api-dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/data/",
        DashboardDataAPIEndpoint.as_view(http_method_names=["get"]),
        name="api-dashboard-data",
    ),
]
