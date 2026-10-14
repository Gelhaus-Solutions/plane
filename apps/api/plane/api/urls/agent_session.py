# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views.agent_session import (
    AgentSessionDetailAPIEndpoint,
    AgentSessionEndAPIEndpoint,
    AgentSessionHeartbeatAPIEndpoint,
    AgentSessionListCreateAPIEndpoint,
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
]
