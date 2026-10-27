# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent steering on the public API (E29): an agent session reports its status, plan and progress on a work item, asks
a question and waits for the answer in its inbox, and finishes into Review for a person to close (D28)."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectEntityPermission
from plane.db.models import Issue
from plane.utils import agent_steering
from plane.utils.agent_steering import Conflict, SessionError
from plane.utils.host import base_host

from .base import BaseAPIView

PAGE_SIZE = 100


def failure(error):
    """A refused steering call as a response: 409 when it no longer applies, 403 when it is not the caller's to do,
    else 400."""
    if isinstance(error, Conflict):
        code = status.HTTP_409_CONFLICT
    elif error.forbidden:
        code = status.HTTP_403_FORBIDDEN
    else:
        code = status.HTTP_400_BAD_REQUEST
    return Response({"error": str(error)}, status=code)


def body_of(request):
    return request.data if isinstance(request.data, dict) else {}


def work_item(slug, project_id, issue_id):
    return Issue.issue_objects.select_related("project", "state").get(
        workspace__slug=slug, project_id=project_id, pk=issue_id
    )


class WorkItemAgentActivityAPIEndpoint(BaseAPIView):
    """The typed activity an agent keeps on a work item, apart from the comments: GET lists it (``kind`` narrows it),
    POST adds a progress note, an error, or a link to a commit or pull request."""

    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, issue_id):
        issue = work_item(slug, project_id, issue_id)
        entries = agent_steering.activity_for(issue, request.GET.get("kind"))[:PAGE_SIZE]
        return Response({"results": [agent_steering.activity_data(entry) for entry in entries]}, status=200)

    def post(self, request, slug, project_id, issue_id):
        issue = work_item(slug, project_id, issue_id)
        body = body_of(request)
        try:
            entry = agent_steering.log(
                issue,
                getattr(request, "agent_session", None),
                body.get("kind"),
                body.get("text"),
                ref=body.get("ref"),
                url=body.get("url"),
            )
        except SessionError as error:
            return failure(error)
        return Response(agent_steering.activity_data(entry), status=status.HTTP_201_CREATED)


class WorkItemReviewAPIEndpoint(BaseAPIView):
    """POST finishes the agent's work into Review: the item moves to the project's Review state and the claim reads
    "waiting for review". Agents never close an item; a person does (D28)."""

    permission_classes = [ProjectEntityPermission]

    def post(self, request, slug, project_id, issue_id):
        issue = work_item(slug, project_id, issue_id)
        try:
            review, moved = agent_steering.request_review(
                issue,
                getattr(request, "agent_session", None),
                body_of(request).get("text", ""),
                origin=base_host(request=request, is_app=True),
                actor=request.user,
            )
        except SessionError as error:
            return failure(error)
        return Response(
            {"state": {"id": str(review.id), "name": review.name, "group": review.group}, "moved": moved},
            status=status.HTTP_200_OK,
        )


class WorkItemQuestionListAPIEndpoint(BaseAPIView):
    """The questions on a work item: GET lists them (``status`` narrows by open, answered, defaulted, expired or
    cancelled), POST asks one. The answer arrives in the asking session's inbox as an ``answer`` message."""

    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, issue_id):
        issue = work_item(slug, project_id, issue_id)
        questions = agent_steering.questions_for(issue, request.GET.get("status"))[:PAGE_SIZE]
        return Response({"results": [agent_steering.question_data(question) for question in questions]}, status=200)

    def post(self, request, slug, project_id, issue_id):
        issue = work_item(slug, project_id, issue_id)
        body = body_of(request)
        try:
            question = agent_steering.ask(
                issue,
                getattr(request, "agent_session", None),
                body.get("question"),
                options=body.get("options"),
                detail=body.get("detail"),
                default=body.get("default"),
                deadline=body.get("deadline"),
                deadline_minutes=body.get("deadline_minutes"),
            )
        except SessionError as error:
            return failure(error)
        question = agent_steering.questions_for(issue).get(pk=question.pk)
        return Response(agent_steering.question_data(question), status=status.HTTP_201_CREATED)


class WorkItemQuestionAPIEndpoint(BaseAPIView):
    """One question: GET shows it with its answer, DELETE withdraws it while it is open (the session that asked it)."""

    permission_classes = [ProjectEntityPermission]

    def _question(self, slug, project_id, issue_id, pk):
        issue = work_item(slug, project_id, issue_id)
        return agent_steering.questions_for(issue).filter(pk=pk).first()

    def get(self, request, slug, project_id, issue_id, pk):
        question = self._question(slug, project_id, issue_id, pk)
        if question is None:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(agent_steering.question_data(question), status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, issue_id, pk):
        question = self._question(slug, project_id, issue_id, pk)
        if question is None:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)
        session = getattr(request, "agent_session", None)
        if session is None and getattr(request.user, "is_bot", False):
            return failure(
                SessionError("Only the session that asked, or a person, withdraws a question", forbidden=True)
            )
        try:
            agent_steering.cancel(question, session=session)
        except SessionError as error:
            return failure(error)
        question.refresh_from_db()
        return Response(agent_steering.question_data(question), status=status.HTTP_200_OK)
