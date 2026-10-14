# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The ``/mcp`` endpoint: Streamable HTTP with stateless JSON responses."""

import json
from urllib.parse import urlparse

from django.http import HttpResponse, JsonResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from plane.api.middleware.api_authentication import APIKeyAuthentication
from plane.db.models import WorkspaceMember
from plane.mcp import server
from plane.mcp.dispatch import Context
from plane.mcp.tools import ToolError


class BearerKeyAuthentication(APIKeyAuthentication):
    """The same API tokens, sent as ``Authorization: Bearer``, which is what MCP clients send."""

    def get_api_token(self, request):
        header = request.headers.get("Authorization", "")
        if header[:7].lower() == "bearer ":
            return header[7:].strip() or None
        return None

    def authenticate_header(self, request):
        # A 401 with this header is how an MCP client learns it must authenticate
        return 'Bearer realm="plane"'


def resolve_workspace(request):
    """The workspace named by ?workspace= or X-Plane-Workspace, else the token's own, else the caller's only one."""
    memberships = WorkspaceMember.objects.filter(member=request.user, is_active=True).select_related("workspace")
    slug = request.query_params.get("workspace") or request.headers.get("X-Plane-Workspace")
    if slug:
        membership = memberships.filter(workspace__slug=slug).first()
        if membership is None:
            raise ToolError(f"You are not a member of workspace {slug}")
        return membership.workspace
    token = getattr(request, "api_token", None)
    if token is not None and token.workspace_id:
        membership = memberships.filter(workspace_id=token.workspace_id).first()
        if membership is not None:
            return membership.workspace
    found = list(memberships[:2])
    if len(found) == 1:
        return found[0].workspace
    raise ToolError("Name the workspace: connect to /mcp?workspace=<slug>")


class MCPEndpoint(APIView):
    authentication_classes = [BearerKeyAuthentication, APIKeyAuthentication]
    permission_classes = [IsAuthenticated]
    # Every tool runs as public API calls, which are throttled per key on their own
    throttle_classes = []

    def get(self, request):
        response = HttpResponse(status=405)
        response["Allow"] = "POST"
        return response

    def post(self, request):
        origin = request.headers.get("Origin")
        if origin and urlparse(origin).netloc != request.get_host():
            return JsonResponse(server.rpc_error(None, server.INVALID_REQUEST, "Origin not allowed"), status=403)
        try:
            payload = json.loads(request.body or b"null")
        except ValueError:
            return JsonResponse(server.rpc_error(None, server.PARSE_ERROR, "Parse error"), status=400)

        context = {}

        def ctx_factory():
            if "ctx" not in context:
                context["ctx"] = Context(
                    token=request.auth,
                    workspace=resolve_workspace(request),
                    host=request.get_host(),
                    secure=request.is_secure(),
                    user=request.user,
                    user_agent=request.headers.get("User-Agent", "plane-mcp")[:255],
                    agent_session=getattr(request, "agent_session", None),
                )
            return context["ctx"]

        if isinstance(payload, list):
            if not payload:
                return JsonResponse(server.rpc_error(None, server.INVALID_REQUEST, "Empty batch"), status=400)
            replies = [reply for reply in (server.handle(m, ctx_factory) for m in payload) if reply is not None]
            return JsonResponse(replies, safe=False) if replies else HttpResponse(status=202)
        reply = server.handle(payload, ctx_factory)
        return JsonResponse(reply) if reply is not None else HttpResponse(status=202)
