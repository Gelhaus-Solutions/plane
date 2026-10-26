# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dashboards on the public API (E23): the app's endpoints behind an API key, so agents and scripts read, draw and
build dashboards with the same rules (D47)."""

from plane.api.middleware.api_authentication import APIKeyAuthentication
from plane.api.rate_limit import ApiKeyRateThrottle
from plane.app.views.dashboard.base import (
    DashboardChartEndpoint,
    DashboardDataEndpoint,
    DashboardDetailEndpoint,
    DashboardDuplicateEndpoint,
    DashboardListEndpoint,
    DashboardWidgetDetailEndpoint,
    DashboardWidgetsEndpoint,
)


class PublicAPI:
    authentication_classes = [APIKeyAuthentication]

    def get_throttles(self):
        return [ApiKeyRateThrottle()]


class DashboardListAPIEndpoint(PublicAPI, DashboardListEndpoint):
    pass


class DashboardDetailAPIEndpoint(PublicAPI, DashboardDetailEndpoint):
    pass


class DashboardDuplicateAPIEndpoint(PublicAPI, DashboardDuplicateEndpoint):
    pass


class DashboardWidgetsAPIEndpoint(PublicAPI, DashboardWidgetsEndpoint):
    pass


class DashboardWidgetDetailAPIEndpoint(PublicAPI, DashboardWidgetDetailEndpoint):
    pass


class DashboardDataAPIEndpoint(PublicAPI, DashboardDataEndpoint):
    pass


class DashboardChartAPIEndpoint(PublicAPI, DashboardChartEndpoint):
    pass
