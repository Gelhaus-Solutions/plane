# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    PropertyDetailAPIEndpoint,
    PropertyListCreateAPIEndpoint,
    PropertyOptionDetailAPIEndpoint,
    PropertyOptionListCreateAPIEndpoint,
    WorkItemPropertyValueAPIEndpoint,
    WorkItemPropertyValuesAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/work-item-properties/",
        PropertyListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-properties",
    ),
    path(
        "workspaces/<str:slug>/work-item-properties/<uuid:pk>/",
        PropertyDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="work-item-property",
    ),
    path(
        "workspaces/<str:slug>/work-item-properties/<uuid:property_id>/options/",
        PropertyOptionListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-property-options",
    ),
    path(
        "workspaces/<str:slug>/work-item-properties/<uuid:property_id>/options/<uuid:pk>/",
        PropertyOptionDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="work-item-property-option",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/properties/",
        WorkItemPropertyValuesAPIEndpoint.as_view(http_method_names=["get"]),
        name="work-item-property-values",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/properties/<uuid:property_id>/",
        WorkItemPropertyValueAPIEndpoint.as_view(http_method_names=["get", "put", "delete"]),
        name="work-item-property-value",
    ),
]
