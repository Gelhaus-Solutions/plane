# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent steering for the web app (E29): Needs you, the Agent tab of a work item, and answering a question."""

from rest_framework import status
from rest_framework.response import Response

from plane.api.views.agent_steering import failure
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue
from plane.utils import agent_board, agent_steering
from plane.utils.agent_steering import SessionError

from .. import BaseAPIView


def _work_item(slug, project_id, issue_id):
    return (
        Issue.issue_objects.select_related("project", "state")
        .filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
        .first()
    )


class WorkspaceNeedsYouEndpoint(BaseAPIView):
    """What waits for the viewer (r6-04): open questions from agents and items in Review, from the projects they are
    in, newest first, with the counts the sidebar shows."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        visible = agent_board.visible_project_ids(request.user, slug)
        return Response(agent_steering.needs_you(slug, visible), status=status.HTTP_200_OK)


class WorkItemAgentActivityEndpoint(BaseAPIView):
    """The Agent tab of a work item: the claim with its status and plan, the questions (open first), and the typed
    activity, newest first."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = _work_item(slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(agent_steering.overview(issue), status=status.HTTP_200_OK)


class WorkItemQuestionEndpoint(BaseAPIView):
    """One question on a work item: DELETE lets a person withdraw it while it is open."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        issue = _work_item(slug, project_id, issue_id)
        question = agent_steering.questions_for(issue).filter(pk=pk).first() if issue else None
        if question is None:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            agent_steering.cancel(question)
        except SessionError as error:
            return failure(error)
        question.refresh_from_db()
        return Response(agent_steering.question_data(question), status=status.HTTP_200_OK)


class WorkItemQuestionAnswerEndpoint(BaseAPIView):
    """A person answers a question: ``option`` (its number, from 1), ``text``, or both. The answer goes to the asking
    session's inbox; one that comes after the deadline reaches it as a correction."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        issue = _work_item(slug, project_id, issue_id)
        question = agent_steering.questions_for(issue).filter(pk=pk).first() if issue else None
        if question is None:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            agent_steering.answer(question, request.user, option=body.get("option"), text=body.get("text", ""))
        except SessionError as error:
            return failure(error)
        question = agent_steering.questions_for(issue).get(pk=pk)
        return Response(agent_steering.question_data(question), status=status.HTTP_200_OK)
