# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent sessions on the public API: a harness bot's key registers them, their own tokens keep them alive."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectEntityPermission, WorkspaceUserPermission
from plane.db.models import AgentSession, Issue, Workspace, WorkspaceMember
from plane.utils import agent_sessions
from plane.utils.agent_sessions import ClaimConflict, SessionError

from .base import BaseAPIView

PAGE_SIZE = 100


def session_data(session):
    bot_user = session.bot.user
    return {
        "id": str(session.id),
        "bot": {"id": str(session.bot_id), "user_id": str(bot_user.id), "display_name": bot_user.display_name},
        "harness": session.harness,
        "external_id": session.external_id,
        "generation": session.generation,
        "name": session.name,
        "primary_dir": session.primary_dir,
        "host": session.host,
        "git_branch": session.git_branch,
        "model": session.model,
        "harness_version": session.harness_version,
        "parent": str(session.parent_id) if session.parent_id else None,
        "status": session.status,
        "started_at": session.started_at,
        "last_seen_at": session.last_seen_at,
        "ended_at": session.ended_at,
        "end_reason": session.end_reason,
    }


def sessions_in(slug):
    return AgentSession.objects.filter(workspace__slug=slug).select_related("bot__user")


def may_act_on(request, session):
    """The session itself, its bot's key, or a workspace admin."""
    own = getattr(request, "agent_session", None)
    if own is not None:
        return own.id == session.id
    if request.user.id == session.bot.user_id:
        return True
    return WorkspaceMember.objects.filter(
        workspace_id=session.workspace_id, member=request.user, role=20, is_active=True
    ).exists()


class AgentSessionListCreateAPIEndpoint(BaseAPIView):
    permission_classes = [WorkspaceUserPermission]

    def get(self, request, slug):
        sessions = sessions_in(slug)
        bot = request.GET.get("bot")
        if bot:
            sessions = sessions.filter(bot_id=bot)
        session_status = request.GET.get("status")
        if session_status:
            sessions = sessions.filter(status__in=session_status.split(","))
        return Response({"results": [session_data(s) for s in sessions[:PAGE_SIZE]]}, status=status.HTTP_200_OK)

    def post(self, request, slug):
        """Register a session with the bot's own key; the answer carries the session's token, shown once."""
        workspace = Workspace.objects.get(slug=slug)
        key = getattr(request, "api_token", None)
        try:
            session, token, created = agent_sessions.register(key, workspace, request.data)
        except SessionError as error:
            code = status.HTTP_403_FORBIDDEN if error.forbidden else status.HTTP_400_BAD_REQUEST
            return Response({"error": str(error)}, status=code)
        data = session_data(session)
        data["token"] = token.token
        data["token_expires_at"] = token.expired_at
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AgentSessionDetailAPIEndpoint(BaseAPIView):
    permission_classes = [WorkspaceUserPermission]

    def get(self, request, slug, pk):
        session = sessions_in(slug).filter(pk=pk).first()
        if session is None:
            return Response({"error": "Agent session not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(session_data(session), status=status.HTTP_200_OK)


class AgentSessionHeartbeatAPIEndpoint(BaseAPIView):
    permission_classes = [WorkspaceUserPermission]

    def post(self, request, slug, pk):
        session = sessions_in(slug).filter(pk=pk).first()
        if session is None:
            return Response({"error": "Agent session not found"}, status=status.HTTP_404_NOT_FOUND)
        if not may_act_on(request, session):
            return Response({"error": "Not this session"}, status=status.HTTP_403_FORBIDDEN)
        if session.status == AgentSession.Status.ENDED:
            return Response({"error": "This agent session has ended"}, status=status.HTTP_409_CONFLICT)
        agent_sessions.touch(session, force=True)
        return Response(session_data(session), status=status.HTTP_200_OK)


class AgentSessionEndAPIEndpoint(BaseAPIView):
    permission_classes = [WorkspaceUserPermission]

    def post(self, request, slug, pk):
        session = sessions_in(slug).filter(pk=pk).first()
        if session is None:
            return Response({"error": "Agent session not found"}, status=status.HTTP_404_NOT_FOUND)
        if not may_act_on(request, session):
            return Response({"error": "Not this session"}, status=status.HTTP_403_FORBIDDEN)
        reason = request.data.get("reason") if isinstance(request.data, dict) else None
        agent_sessions.end(session, reason=str(reason) if reason else "ended")
        return Response(session_data(session), status=status.HTTP_200_OK)


def claim_data(claim):
    if claim is None:
        return None
    session = claim.session
    return {
        "id": str(claim.id),
        "work_item_id": str(claim.issue_id),
        "label": agent_sessions.claim_label(claim),
        "session": {
            "id": str(session.id),
            "name": session.name,
            "status": session.status,
            "bot": session.bot.user.display_name,
        },
        "claimed_at": claim.claimed_at,
        "ended_at": claim.ended_at,
        "end_reason": claim.end_reason,
    }


class WorkItemClaimAPIEndpoint(BaseAPIView):
    """A session's claim on a work item (D17, D23): POST claims, DELETE releases, GET shows the open one."""

    permission_classes = [ProjectEntityPermission]

    def _issue(self, slug, project_id, issue_id):
        return Issue.issue_objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)

    def get(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        return Response({"claim": claim_data(agent_sessions.open_claim(issue))}, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, issue_id):
        session = getattr(request, "agent_session", None)
        if session is None:
            return Response(
                {"error": "Only an agent session claims work: register one with the bot key and use its token"},
                status=status.HTTP_403_FORBIDDEN,
            )
        issue = self._issue(slug, project_id, issue_id)
        try:
            claim, created = agent_sessions.claim(issue, session)
        except ClaimConflict as conflict:
            return Response(
                {"error": str(conflict), "claim": claim_data(conflict.claim)}, status=status.HTTP_409_CONFLICT
            )
        except SessionError as error:
            return Response({"error": str(error)}, status=status.HTTP_403_FORBIDDEN)
        return Response({"claim": claim_data(claim)}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        try:
            claim = agent_sessions.release(issue, session=getattr(request, "agent_session", None))
        except SessionError as error:
            return Response({"error": str(error)}, status=status.HTTP_403_FORBIDDEN)
        return Response({"claim": claim_data(claim)}, status=status.HTTP_200_OK)
