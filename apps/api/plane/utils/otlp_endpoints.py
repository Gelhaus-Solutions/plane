# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared OTLP endpoint helpers so metrics and traces use the same collector
when both are enabled. One URL (OTLP_ENDPOINT) is enough: same as traces
(e.g. https://otel.example.com behind nginx ingress with gRPC backend).

There is no default collector: when OTLP_ENDPOINT is unset, nothing is
exported. Upstream defaulted to Plane Software's telemetry.plane.so, which a
hard fork has no business reporting to.
"""

import os
from urllib.parse import urlparse

# When no port in URL: https -> 443 (ingress), http -> 4317 (OTLP gRPC default)
OTLP_GRPC_DEFAULT_PORT = "4317"
HTTPS_DEFAULT_PORT = "443"


def get_otlp_endpoint() -> str | None:
    """Return OTLP_ENDPOINT, or None when it is unset or blank."""
    return os.environ.get("OTLP_ENDPOINT", "").strip() or None


def grpc_endpoint_from_url(url: str) -> str:
    """
    Derive gRPC host:port from OTLP_ENDPOINT URL.
    - https://otel.example.com -> otel.example.com:443 (nginx ingress)
    - otel.example.com:4317 -> otel.example.com:4317 (scheme-less with port)
    - otel.example.com -> otel.example.com:4317 (scheme-less, default gRPC port)
    - Explicit port in URL is always preserved.
    """
    # urlparse needs a scheme to correctly populate hostname/netloc.
    # Scheme-less values like "host:port" are misread as scheme="host", path="port".
    if "://" not in url:
        url = "//" + url
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        raise ValueError(f"OTLP endpoint has no host: {url!r}")
    if parsed.port is not None:
        port = str(parsed.port)
    elif parsed.scheme == "https":
        port = HTTPS_DEFAULT_PORT
    else:
        port = OTLP_GRPC_DEFAULT_PORT
    return f"{host}:{port}"


def get_otlp_grpc_endpoint() -> str:
    """
    Return the gRPC endpoint (host:port) for OTLP traces and metrics.
    Derived from OTLP_ENDPOINT so the same URL works for both (e.g. collector
    behind nginx ingress with gRPC backend on 443). Requires OTLP_ENDPOINT.
    """
    return grpc_endpoint_from_url(_require_otlp_endpoint())


def get_otlp_http_metrics_url() -> str:
    """Return the HTTP URL for OTLP metrics (OTLP_ENDPOINT + /v1/metrics). Requires OTLP_ENDPOINT."""
    return f"{_require_otlp_endpoint().rstrip('/')}/v1/metrics"


def _require_otlp_endpoint() -> str:
    endpoint = get_otlp_endpoint()
    if endpoint is None:
        raise RuntimeError("OTLP_ENDPOINT is not set; there is no default collector")
    return endpoint
