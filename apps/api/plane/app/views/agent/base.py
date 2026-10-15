# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent sessions and the agents on a work item, for the web app (E28, D46): the pickers list a bot's sessions, live
first, and assigning or delegating from the web goes through the same path as the API, so the session hears it."""

import uuid

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import AgentSession, Issue, IssueAssignee, WorkItemClaim
from plane.utils import agent_assignments
from plane.utils.agent_sessions import SessionError, session_data, sessions_in

from .. import BaseAPIView

PAGE_SIZE = 200
DEFAULT_STATUSES = (AgentSession.Status.LIVE, AgentSession.Status.AWAY)
STATUS_ORDER = {AgentSession.Status.LIVE: 0, AgentSession.Status.AWAY: 1, AgentSession.Status.ENDED: 2}


def _uuid_or_none(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError):
        return None


def _with_holds(sessions):
    """The sessions as the app shows them, each with the work items it holds."""
    claims = WorkItemClaim.objects.filter(session__in=sessions, ended_at__isnull=True).select_related("issue__project")
    holds = {}
    for claim in claims:
        issue = claim.issue
        holds.setdefault(claim.session_id, []).append(
            {
                "id": str(issue.id),
                "project_id": str(issue.project_id),
                "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
                "name": issue.name,
                "claimed_at": claim.claimed_at,
            }
        )
    results = []
    for session in sessions:
        data = session_data(session)
        data["bot"]["avatar_url"] = session.bot.user.avatar_url
        data["holds"] = holds.get(session.id, [])
        results.append(data)
    return results


class WorkspaceAgentSessionsEndpoint(BaseAPIView):
    """The workspace's agent sessions, live first, each with what it holds; ``status`` picks live, away or ended."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        wanted = [value for value in request.GET.get("status", "").split(",") if value in AgentSession.Status.values]
        sessions = sessions_in(slug).filter(status__in=wanted or DEFAULT_STATUSES)
        bot = _uuid_or_none(request.GET.get("bot"))
        if bot:
            sessions = sessions.filter(bot__user_id=bot)
        sessions = sorted(
            sessions[:PAGE_SIZE], key=lambda s: (STATUS_ORDER.get(s.status, 3), -s.last_seen_at.timestamp())
        )
        return Response({"results": _with_holds(sessions)}, status=status.HTTP_200_OK)


class WorkspaceAgentSessionEndpoint(BaseAPIView):
    """One session of the workspace, with what it holds: the card a chip opens."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        session = sessions_in(slug).filter(pk=pk).first()
        if session is None:
            return Response({"error": "Agent session not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(_with_holds([session])[0], status=status.HTTP_200_OK)


class ProjectAgentRowsEndpoint(BaseAPIView):
    """The agents on a project's open work items, one entry per item that has a bot assignee or an open claim: what
    the list and board rows show next to the title (D46)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        rows = (
            IssueAssignee.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                assignee__is_bot=True,
                issue__deleted_at__isnull=True,
                issue__archived_at__isnull=True,
                issue__is_draft=False,
            )
            .exclude(issue__state__group__in=agent_assignments.CLOSED_GROUPS)
            .select_related("assignee", "agent_session")
            .order_by("created_at")
        )
        claims = WorkItemClaim.objects.filter(
            workspace__slug=slug, issue__project_id=project_id, ended_at__isnull=True
        ).select_related("session__bot__user")
        by_issue = {}
        for row in rows:
            entry = by_issue.setdefault(str(row.issue_id), {"issue_id": str(row.issue_id), "agents": [], "claim": None})
            entry["agents"].append(agent_assignments.row_data(row, agent_assignments.row_state(row)))
        for claim in claims:
            entry = by_issue.setdefault(
                str(claim.issue_id), {"issue_id": str(claim.issue_id), "agents": [], "claim": None}
            )
            entry["claim"] = agent_assignments.claim_data(claim)
        return Response({"results": list(by_issue.values())}, status=status.HTTP_200_OK)


class WorkItemAgentsEndpoint(BaseAPIView):
    """The agents on a work item: POST names a bot (its queue), one of its sessions, or a bot to delegate to; DELETE
    takes a bot off; GET lists them with where each stands (queue, session, or waiting after its session ended)."""

    def _issue(self, slug, project_id, issue_id):
        return Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()

    def _listing(self, issue):
        claim = WorkItemClaim.objects.filter(issue=issue, ended_at__isnull=True).select_related("session__bot__user")
        claim = claim.first()
        return {
            "agents": [agent_assignments.row_data(row, state) for row, state in agent_assignments.rows_for(issue)],
            "claim": agent_assignments.claim_data(claim) if claim else None,
        }

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._listing(issue), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        body = request.data if isinstance(request.data, dict) else {}
        session = None
        if body.get("session"):
            session = sessions_in(slug).filter(pk=_uuid_or_none(body["session"])).first()
            if session is None:
                return Response({"error": "Agent session not found"}, status=status.HTTP_404_NOT_FOUND)
        if body.get("bot"):
            bot = agent_assignments.find_bot(issue.workspace_id, _uuid_or_none(body["bot"]))
        else:
            bot = session.bot if session is not None else None
        if bot is None:
            return Response({"error": "Name a bot or a session of one"}, status=status.HTTP_400_BAD_REQUEST)
        delegate = body.get("delegate", False)
        if not isinstance(delegate, bool):
            return Response({"error": "delegate must be true or false"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            agent_assignments.assign(issue, bot, session=session, delegate=delegate, actor=request.user)
        except SessionError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._listing(issue), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        bot = agent_assignments.find_bot(issue.workspace_id, _uuid_or_none(request.GET.get("bot")))
        if bot is None:
            return Response({"error": "Name the bot to take off"}, status=status.HTTP_400_BAD_REQUEST)
        agent_assignments.unassign(issue, bot)
        return Response(self._listing(issue), status=status.HTTP_200_OK)
