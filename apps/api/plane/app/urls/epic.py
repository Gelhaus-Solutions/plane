# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    EpicUpdatesEndpoint,
    EpicWaveDetailEndpoint,
    EpicWavesEndpoint,
    ProjectEpicConvertEndpoint,
    ProjectEpicDetailEndpoint,
    ProjectEpicsEndpoint,
    WorkspaceEpicsEndpoint,
)

urlpatterns = [
    path("workspaces/<str:slug>/epics/", WorkspaceEpicsEndpoint.as_view(), name="workspace-epics"),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/",
        ProjectEpicsEndpoint.as_view(),
        name="project-epics",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/convert/",
        ProjectEpicConvertEndpoint.as_view(),
        name="project-epic-convert",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/",
        ProjectEpicDetailEndpoint.as_view(),
        name="project-epic-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/updates/",
        EpicUpdatesEndpoint.as_view(),
        name="project-epic-updates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epic-waves/",
        EpicWavesEndpoint.as_view(),
        name="project-epic-waves",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epic-waves/<uuid:wave_id>/",
        EpicWaveDetailEndpoint.as_view(),
        name="project-epic-wave-detail",
    ),
]
