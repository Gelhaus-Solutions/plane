# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Call the public API in-process, as the MCP caller."""

import json
from dataclasses import dataclass
from urllib.parse import urlencode

from django.test import RequestFactory
from django.urls import Resolver404, resolve

API_PREFIX = "/api/v1/"


@dataclass
class Context:
    """Who is calling and where: the caller's token is replayed on every inner request."""

    token: str
    workspace: object
    host: str
    secure: bool
    user: object
    user_agent: str = "plane-mcp"
    agent_session: object = None

    @property
    def slug(self):
        return self.workspace.slug


@dataclass
class ApiResult:
    status: int
    data: object
    location: str = None

    @property
    def ok(self):
        return 200 <= self.status < 300


def _clean(query):
    out = {}
    for key, value in (query or {}).items():
        if value is None or value == "" or value == []:
            continue
        out[key] = str(value).lower() if isinstance(value, bool) else value
    return out


def call(ctx, method, path, query=None, body=None):
    """Run one public API request; ``path`` is relative to ``/api/v1/``."""
    url = API_PREFIX + path.lstrip("/")
    query = _clean(query)
    full = url + ("?" + urlencode(query, doseq=True) if query else "")
    factory = RequestFactory(HTTP_HOST=ctx.host, HTTP_X_API_KEY=ctx.token, HTTP_USER_AGENT=ctx.user_agent)
    builder = getattr(factory, method.lower())
    if method.upper() in ("POST", "PATCH", "PUT"):
        request = builder(full, data=json.dumps(body or {}), content_type="application/json", secure=ctx.secure)
    else:
        request = builder(full, secure=ctx.secure)
    try:
        match = resolve(url)
    except Resolver404:
        return ApiResult(404, {"error": f"No such API route: {url}"})
    response = match.func(request, *match.args, **match.kwargs)
    if hasattr(response, "render"):
        response.render()
    content = getattr(response, "content", b"")
    try:
        data = json.loads(content) if content else None
    except ValueError:
        data = {"error": content.decode(errors="replace")[:500]}
    return ApiResult(response.status_code, data, response.get("Location"))
