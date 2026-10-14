# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.agent.base import (
    ProjectAgentRowsEndpoint,
    WorkItemAgentsEndpoint,
    WorkspaceAgentSessionsEndpoint,
)

urlpatterns = [
    path("workspaces/<str:slug>/agent-sessions/", WorkspaceAgentSessionsEndpoint.as_view(), name="agent-sessions"),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/agent-rows/",
        ProjectAgentRowsEndpoint.as_view(),
        name="project-agent-rows",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/agents/",
        WorkItemAgentsEndpoint.as_view(),
        name="work-item-agents",
    ),
]
