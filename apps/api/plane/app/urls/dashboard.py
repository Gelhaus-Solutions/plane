# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    DashboardChartEndpoint,
    DashboardDataEndpoint,
    DashboardDetailEndpoint,
    DashboardDuplicateEndpoint,
    DashboardFavoriteEndpoint,
    DashboardLayoutEndpoint,
    DashboardListEndpoint,
    DashboardPreviewEndpoint,
    DashboardWidgetDetailEndpoint,
    DashboardWidgetsEndpoint,
)

# Dashboards of PQL widgets (E23)
urlpatterns = [
    path("workspaces/<str:slug>/dashboards/", DashboardListEndpoint.as_view(), name="dashboards"),
    path("workspaces/<str:slug>/dashboards/chart/", DashboardChartEndpoint.as_view(), name="dashboard-chart"),
    path("workspaces/<str:slug>/dashboards/<uuid:pk>/", DashboardDetailEndpoint.as_view(), name="dashboard"),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/duplicate/",
        DashboardDuplicateEndpoint.as_view(),
        name="dashboard-duplicate",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/favorite/",
        DashboardFavoriteEndpoint.as_view(),
        name="dashboard-favorite",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/",
        DashboardWidgetsEndpoint.as_view(),
        name="dashboard-widgets",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/<uuid:widget_id>/",
        DashboardWidgetDetailEndpoint.as_view(),
        name="dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/layout/",
        DashboardLayoutEndpoint.as_view(),
        name="dashboard-layout",
    ),
    path("workspaces/<str:slug>/dashboards/<uuid:pk>/data/", DashboardDataEndpoint.as_view(), name="dashboard-data"),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/preview/",
        DashboardPreviewEndpoint.as_view(),
        name="dashboard-preview",
    ),
]
