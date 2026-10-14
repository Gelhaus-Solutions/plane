# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from plane.utils.otlp_endpoints import (
    get_otlp_endpoint,
    get_otlp_grpc_endpoint,
    get_otlp_http_metrics_url,
    grpc_endpoint_from_url,
)


@pytest.mark.unit
class TestOtlpEndpointUnset:
    """Without OTLP_ENDPOINT there is no collector: nothing falls back to telemetry.plane.so"""

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_get_otlp_endpoint_is_none(self, monkeypatch, value):
        if value is None:
            monkeypatch.delenv("OTLP_ENDPOINT", raising=False)
        else:
            monkeypatch.setenv("OTLP_ENDPOINT", value)
        assert get_otlp_endpoint() is None

    def test_grpc_endpoint_refuses_to_guess(self, monkeypatch):
        monkeypatch.delenv("OTLP_ENDPOINT", raising=False)
        with pytest.raises(RuntimeError):
            get_otlp_grpc_endpoint()

    def test_http_metrics_url_refuses_to_guess(self, monkeypatch):
        monkeypatch.delenv("OTLP_ENDPOINT", raising=False)
        with pytest.raises(RuntimeError):
            get_otlp_http_metrics_url()


@pytest.mark.unit
class TestOtlpEndpointSet:
    """A configured OTLP_ENDPOINT is used as given"""

    def test_endpoints_follow_the_configured_url(self, monkeypatch):
        monkeypatch.setenv("OTLP_ENDPOINT", "https://otel.example.com/")
        assert get_otlp_endpoint() == "https://otel.example.com/"
        assert get_otlp_grpc_endpoint() == "otel.example.com:443"
        assert get_otlp_http_metrics_url() == "https://otel.example.com/v1/metrics"

    @pytest.mark.parametrize(
        ("url", "expected"),
        [
            ("https://otel.example.com", "otel.example.com:443"),
            ("http://otel.example.com", "otel.example.com:4317"),
            ("otel.example.com:4318", "otel.example.com:4318"),
            ("otel.example.com", "otel.example.com:4317"),
        ],
    )
    def test_grpc_endpoint_from_url(self, url, expected):
        assert grpc_endpoint_from_url(url) == expected

    def test_grpc_endpoint_from_url_without_host_raises(self):
        with pytest.raises(ValueError):
            grpc_endpoint_from_url("https://")
