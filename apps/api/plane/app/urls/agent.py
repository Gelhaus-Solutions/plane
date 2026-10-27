# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.agent.base import (
    ProjectAgentRowsEndpoint,
    WorkItemAgentsEndpoint,
    WorkItemClaimEndpoint,
    WorkspaceAgentSessionEndpoint,
    WorkspaceAgentSessionPanelEndpoint,
    WorkspaceAgentSessionsEndpoint,
)

from plane.app.views.agent.steering import (
    WorkItemAgentActivityEndpoint,
    WorkItemQuestionAnswerEndpoint,
    WorkItemQuestionEndpoint,
    WorkspaceNeedsYouEndpoint,
)

urlpatterns = [
    path("workspaces/<str:slug>/agent-sessions/", WorkspaceAgentSessionsEndpoint.as_view(), name="agent-sessions"),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/",
        WorkspaceAgentSessionEndpoint.as_view(),
        name="agent-session",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/panel/",
        WorkspaceAgentSessionPanelEndpoint.as_view(),
        name="agent-session-panel",
    ),
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
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/claim/",
        WorkItemClaimEndpoint.as_view(),
        name="work-item-claim",
    ),
    path("workspaces/<str:slug>/needs-you/", WorkspaceNeedsYouEndpoint.as_view(), name="needs-you"),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/agent-activity/",
        WorkItemAgentActivityEndpoint.as_view(),
        name="work-item-agent-activity",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/questions/<uuid:pk>/",
        WorkItemQuestionEndpoint.as_view(),
        name="work-item-question",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/questions/<uuid:pk>/answer/",
        WorkItemQuestionAnswerEndpoint.as_view(),
        name="work-item-question-answer",
    ),
]
