# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views.agent_steering import (
    WorkItemAgentActivityAPIEndpoint,
    WorkItemQuestionAPIEndpoint,
    WorkItemQuestionListAPIEndpoint,
    WorkItemReviewAPIEndpoint,
)
from plane.api.views.agent_session import (
    AgentSessionDetailAPIEndpoint,
    AgentSessionEndAPIEndpoint,
    AgentSessionHeartbeatAPIEndpoint,
    AgentSessionInboxAckAPIEndpoint,
    AgentSessionInboxAPIEndpoint,
    AgentSessionListCreateAPIEndpoint,
    AgentSessionWorkAPIEndpoint,
    WorkItemAgentsAPIEndpoint,
    WorkItemClaimAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/agent-sessions/",
        AgentSessionListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="agent-sessions",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/",
        AgentSessionDetailAPIEndpoint.as_view(http_method_names=["get"]),
        name="agent-session-detail",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/heartbeat/",
        AgentSessionHeartbeatAPIEndpoint.as_view(http_method_names=["post"]),
        name="agent-session-heartbeat",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/end/",
        AgentSessionEndAPIEndpoint.as_view(http_method_names=["post"]),
        name="agent-session-end",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/inbox/",
        AgentSessionInboxAPIEndpoint.as_view(http_method_names=["get"]),
        name="agent-session-inbox",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/inbox/ack/",
        AgentSessionInboxAckAPIEndpoint.as_view(http_method_names=["post"]),
        name="agent-session-inbox-ack",
    ),
    path(
        "workspaces/<str:slug>/agent-sessions/<uuid:pk>/work/",
        AgentSessionWorkAPIEndpoint.as_view(http_method_names=["get"]),
        name="agent-session-work",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/agents/",
        WorkItemAgentsAPIEndpoint.as_view(http_method_names=["get", "post", "delete"]),
        name="work-item-agents",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/claim/",
        WorkItemClaimAPIEndpoint.as_view(http_method_names=["get", "post", "patch", "delete"]),
        name="work-item-claim",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/agent-activity/",
        WorkItemAgentActivityAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-agent-activity",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/review/",
        WorkItemReviewAPIEndpoint.as_view(http_method_names=["post"]),
        name="work-item-review",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/questions/",
        WorkItemQuestionListAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-questions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/questions/<uuid:pk>/",
        WorkItemQuestionAPIEndpoint.as_view(http_method_names=["get", "delete"]),
        name="work-item-question",
    ),
]
