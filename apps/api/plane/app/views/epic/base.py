# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Epics (E11): the lists in a project and across projects, an epic's page, its updates and the project's waves."""

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError
from django.utils import timezone

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.issue_description_version_task import issue_description_version_task
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    EpicDetail,
    EpicHealth,
    EpicSize,
    EpicUpdate,
    EpicWave,
    Issue,
    Project,
    ProjectMember,
    StateGroup,
)
from plane.utils.epics import (
    PACE_WINDOW_DAYS,
    added_since,
    burnup,
    epic_queryset,
    make_epic,
    month_start,
    needs,
    quarter_start,
    review_state_ids,
    serialize_epics,
    serialize_update,
    unmake_epic,
)
from plane.utils.host import base_host

from .. import BaseAPIView

EPIC_DETAIL_FIELDS = ("lead_id", "wave_id", "size")


class EpicWaveSerializer(serializers.ModelSerializer):
    project_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = EpicWave
        fields = ["id", "project_id", "code", "name", "sort_order"]
        read_only_fields = ["id", "project_id"]


class EpicUpdateInputSerializer(serializers.Serializer):
    health = serializers.ChoiceField(choices=EpicHealth.choices)
    body = serializers.CharField(required=False, allow_blank=True, max_length=4000, default="")


def _guest_only_own(request, slug, project):
    """A guest without 'view all' sees only the epics they created, as in the work item list."""
    return (
        ProjectMember.objects.filter(
            workspace__slug=slug, project=project, member=request.user, role=ROLE.GUEST.value, is_active=True
        ).exists()
        and not project.guest_view_all_features
    )


def _clean_detail_fields(data, project):
    """Validates lead, wave and size from a request; answers the fields to set and an error, if any."""
    out = {}
    if "size" in data:
        size = data.get("size") or None
        if size is not None and size not in EpicSize.values:
            return None, {"size": f"Pick one of {', '.join(EpicSize.values)}."}
        out["size"] = size
    if "wave_id" in data:
        wave_id = data.get("wave_id") or None
        if wave_id is not None and not EpicWave.objects.filter(pk=wave_id, project=project).exists():
            return None, {"wave_id": "No such wave in this project."}
        out["wave_id"] = wave_id
    if "lead_id" in data:
        lead_id = data.get("lead_id") or None
        if (
            lead_id is not None
            and not ProjectMember.objects.filter(project=project, member_id=lead_id, is_active=True).exists()
        ):
            return None, {"lead_id": "The lead must be a member of the project."}
        out["lead_id"] = lead_id
    return out, None


def _epic_detail_payload(epic, user):
    today = timezone.localdate()
    row = serialize_epics(epic_queryset(pk=epic.pk), today=today)[0]
    row.update(
        {
            "description_html": epic.description_html,
            "burnup": burnup(epic, today=today),
            "added_this_month": added_since(epic, month_start(today)),
            "pace_window_days": PACE_WINDOW_DAYS,
            "needs": needs(epic, user),
            "review_state_ids": review_state_ids(epic.project_id),
        }
    )
    return row


class ProjectEpicsEndpoint(BaseAPIView):
    """The epics of a project (r4-10), and a new epic."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        epics = epic_queryset(project_id=project_id, workspace__slug=slug)
        if _guest_only_own(request, slug, project):
            epics = epics.filter(created_by=request.user)
        return Response(serialize_epics(epics), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        details, error = _clean_detail_fields(request.data, project)
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        issue_data = {key: value for key, value in request.data.items() if key not in EPIC_DETAIL_FIELDS}
        serializer = IssueCreateSerializer(
            data=issue_data,
            context={
                "project_id": project_id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        issue = serializer.save()
        detail = make_epic(issue)
        for key, value in details.items():
            setattr(detail, key, value)
        if details:
            detail.save()

        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps(issue_data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        model_activity.delay(
            model_name="issue",
            model_id=str(issue.id),
            requested_data=issue_data,
            current_instance=None,
            actor_id=request.user.id,
            slug=slug,
            origin=base_host(request=request, is_app=True),
        )
        issue_description_version_task.delay(
            updated_issue=json.dumps(issue_data, cls=DjangoJSONEncoder),
            issue_id=str(issue.id),
            user_id=request.user.id,
            is_creating=True,
        )
        return Response(serialize_epics(epic_queryset(pk=issue.pk))[0], status=status.HTTP_201_CREATED)


class ProjectEpicDetailEndpoint(BaseAPIView):
    """One epic's page (r4-12): its row, description, burn-up, needs; and its lead, wave and size."""

    def _epic(self, slug, project_id, epic_id):
        return epic_queryset(pk=epic_id, project_id=project_id, workspace__slug=slug).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, epic_id):
        epic = self._epic(slug, project_id, epic_id)
        if epic is None or (_guest_only_own(request, slug, epic.project) and epic.created_by_id != request.user.id):
            return Response({"error": "Epic not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_epic_detail_payload(epic, request.user), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, epic_id):
        epic = self._epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found."}, status=status.HTTP_404_NOT_FOUND)
        details, error = _clean_detail_fields(request.data, epic.project)
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        detail = make_epic(epic)
        for key, value in details.items():
            setattr(detail, key, value)
        detail.save()
        return Response(serialize_epics(epic_queryset(pk=epic.pk))[0], status=status.HTTP_200_OK)


class ProjectEpicConvertEndpoint(BaseAPIView):
    """Turns a work item into an epic, or an epic back into a work item. The lead starts as its first assignee."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        issue = Issue.issue_objects.filter(
            pk=request.data.get("issue_id"), project_id=project_id, workspace__slug=slug
        ).first()
        if issue is None:
            return Response({"error": "Work item not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get("is_epic", True):
            first_assignee = issue.assignees.order_by("issue_assignee__created_at").values_list("id", flat=True).first()
            make_epic(issue, lead_id=first_assignee)
            return Response(serialize_epics(epic_queryset(pk=issue.pk))[0], status=status.HTTP_200_OK)
        unmake_epic(issue)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EpicUpdatesEndpoint(BaseAPIView):
    """An epic's status updates, newest first; posting one sets the epic's health."""

    def _epic(self, slug, project_id, epic_id):
        return epic_queryset(pk=epic_id, project_id=project_id, workspace__slug=slug).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, epic_id):
        epic = self._epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found."}, status=status.HTTP_404_NOT_FOUND)
        updates = EpicUpdate.objects.filter(epic=epic).order_by("-created_at")[:50]
        return Response([serialize_update(update) for update in updates], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, epic_id):
        epic = self._epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EpicUpdateInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        update = EpicUpdate.objects.create(
            epic=epic,
            project_id=epic.project_id,
            health=serializer.validated_data["health"],
            body=serializer.validated_data.get("body", "").strip(),
        )
        return Response(serialize_update(update), status=status.HTTP_201_CREATED)


class EpicWavesEndpoint(BaseAPIView):
    """A project's waves, in order; members add them."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        waves = EpicWave.objects.filter(project_id=project_id, workspace__slug=slug)
        return Response(EpicWaveSerializer(waves, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = EpicWaveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        code = serializer.validated_data["code"].strip()
        if EpicWave.objects.filter(project=project, code__iexact=code).exists():
            return Response({"code": "This project already has that wave."}, status=status.HTTP_409_CONFLICT)
        last = EpicWave.objects.filter(project=project).order_by("-sort_order").first()
        try:
            wave = serializer.save(
                project=project,
                code=code,
                sort_order=serializer.validated_data.get("sort_order")
                or ((last.sort_order + 10000) if last else 65535),
            )
        except IntegrityError:
            return Response({"code": "This project already has that wave."}, status=status.HTTP_409_CONFLICT)
        return Response(EpicWaveSerializer(wave).data, status=status.HTTP_201_CREATED)


class EpicWaveDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, wave_id):
        wave = EpicWave.objects.filter(pk=wave_id, project_id=project_id, workspace__slug=slug).first()
        if wave is None:
            return Response({"error": "Wave not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EpicWaveSerializer(wave, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        code = serializer.validated_data.get("code")
        if (
            code
            and EpicWave.objects.filter(project_id=project_id, code__iexact=code.strip()).exclude(pk=wave.pk).exists()
        ):
            return Response({"code": "This project already has that wave."}, status=status.HTTP_409_CONFLICT)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, wave_id):
        wave = EpicWave.objects.filter(pk=wave_id, project_id=project_id, workspace__slug=slug).first()
        if wave is None:
            return Response({"error": "Wave not found."}, status=status.HTTP_404_NOT_FOUND)
        EpicDetail.objects.filter(wave=wave).update(wave=None)
        wave.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceEpicsEndpoint(BaseAPIView):
    """Epics across the projects the user is a member of (r4-11), with the counts above the list."""

    STATUS_FILTERS = {
        "open": {"exclude": [StateGroup.COMPLETED.value, StateGroup.CANCELLED.value]},
        "done": {"include": [StateGroup.COMPLETED.value]},
        "all": {},
    }

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        memberships = ProjectMember.objects.filter(
            workspace__slug=slug, member=request.user, is_active=True, project__archived_at__isnull=True
        ).select_related("project")
        # projects with epics switched off (D45) keep their epics but leave them out of the lists
        memberships = [m for m in memberships if m.project.epic_view]
        visible = [m.project_id for m in memberships if m.role != ROLE.GUEST.value or m.project.guest_view_all_features]
        own_only = [m.project_id for m in memberships if m.project_id not in visible]

        epics = epic_queryset(workspace__slug=slug, project_id__in=visible) | epic_queryset(
            workspace__slug=slug, project_id__in=own_only, created_by=request.user
        )
        project_ids = [pk for pk in request.GET.get("project_ids", "").split(",") if pk]
        if project_ids:
            epics = epics.filter(project_id__in=project_ids)

        today = timezone.localdate()
        rows = serialize_epics(epics, today=today)
        quarter = quarter_start(today)
        stats = {
            "total": len(rows),
            "projects": len({row["project_id"] for row in rows}),
            "in_progress": sum(1 for row in rows if row["state_group"] == StateGroup.STARTED.value),
            "on_track": sum(1 for row in rows if row["health"] == EpicHealth.ON_TRACK.value and _is_open(row)),
            "at_risk": sum(1 for row in rows if row["health"] == EpicHealth.AT_RISK.value and _is_open(row)),
            "off_track": sum(1 for row in rows if row["health"] == EpicHealth.OFF_TRACK.value and _is_open(row)),
            "done_this_quarter": sum(
                1
                for row in rows
                if row["state_group"] == StateGroup.COMPLETED.value
                and row["completed_at"]
                and row["completed_at"] >= quarter
            ),
        }

        status_filter = self.STATUS_FILTERS.get(request.GET.get("status", "open"), self.STATUS_FILTERS["open"])
        if "exclude" in status_filter:
            rows = [row for row in rows if row["state_group"] not in status_filter["exclude"]]
        if "include" in status_filter:
            rows = [row for row in rows if row["state_group"] in status_filter["include"]]
        return Response({"stats": stats, "results": rows}, status=status.HTTP_200_OK)


def _is_open(row):
    return row["state_group"] not in (StateGroup.COMPLETED.value, StateGroup.CANCELLED.value)
