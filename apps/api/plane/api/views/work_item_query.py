# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Work item queries across projects: the workspace-wide list, the archived list and counts.

All three take a ``pql`` filter. They only see work items in projects the caller is an
active member of; a guest in a project without "guests see everything" sees only the
work items they created, as in the app.
"""

from django.db.models import Count, F, Func, OuterRef, Q
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import IssueSerializer
from plane.app.permissions import ROLE, ProjectEntityPermission, WorkspaceUserPermission
from plane.db.models import CycleIssue, Issue, IssueAssignee, IssueLabel, ModuleIssue, ProjectMember
from plane.utils.openapi import (
    CURSOR_PARAMETER,
    EXPAND_PARAMETER,
    FIELDS_PARAMETER,
    ORDER_BY_PARAMETER,
    PER_PAGE_PARAMETER,
    PQL_PARAMETER,
)
from plane.utils.order_queryset import ISSUE_ORDER_BY_ALLOWLIST, sanitize_order_by
from plane.utils.pql.backend import apply_pql
from plane.utils.pql.compiler import PQLContext

from .base import BaseAPIView
from .issue import annotate_work_item_counts, order_work_items


def visible_work_items(queryset, user):
    """Limit work items to the projects ``user`` may read them in."""
    memberships = ProjectMember.objects.filter(member=user, is_active=True, project__archived_at__isnull=True)
    readable = memberships.filter(Q(role__gt=ROLE.GUEST.value) | Q(project__guest_view_all_features=True))
    own_only = memberships.filter(role=ROLE.GUEST.value, project__guest_view_all_features=False)
    return queryset.filter(
        Q(project_id__in=readable.values("project_id"))
        | Q(project_id__in=own_only.values("project_id"), created_by=user)
    )


def _list_queryset(queryset):
    return annotate_work_item_counts(
        queryset.annotate(
            sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
            .order_by()
            .annotate(count=Func(F("id"), function="Count"))
            .values("count")
        )
        .select_related("project", "workspace", "state", "parent")
        .prefetch_related("assignees", "labels")
    )


class _WorkItemListMixin:
    def list_response(self, request, slug, queryset):
        pql = request.GET.get("pql")
        if pql:
            queryset = apply_pql(queryset, pql, PQLContext.for_request(request, slug))
        order_by = sanitize_order_by(
            request.GET.get("order_by", "-created_at"), ISSUE_ORDER_BY_ALLOWLIST, default="-created_at"
        )
        return self.paginate(
            request=request,
            queryset=order_work_items(_list_queryset(queryset), order_by),
            total_count_queryset=queryset,
            on_results=lambda issues: IssueSerializer(issues, many=True, fields=self.fields, expand=self.expand).data,
        )


LIST_PARAMETERS = [
    PQL_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    ORDER_BY_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
]


class WorkspaceWorkItemListAPIEndpoint(_WorkItemListMixin, BaseAPIView):
    """Work items across every project the caller belongs to."""

    permission_classes = [WorkspaceUserPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="list_workspace_work_items",
        tags=["Work Items"],
        summary="List work items across projects",
        description="Work items in every project you are a member of, filtered with pql.",
        parameters=LIST_PARAMETERS,
    )
    def get(self, request, slug):
        queryset = visible_work_items(Issue.issue_objects.filter(workspace__slug=slug), request.user)
        return self.list_response(request, slug, queryset)


class ArchivedWorkItemListAPIEndpoint(_WorkItemListMixin, BaseAPIView):
    """Archived work items of one project."""

    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="list_archived_work_items",
        tags=["Work Items"],
        summary="List archived work items",
        description="Archived work items of a project, filtered with pql.",
        parameters=LIST_PARAMETERS,
    )
    def get(self, request, slug, project_id):
        queryset = visible_work_items(
            Issue.objects.filter(
                workspace__slug=slug, project_id=project_id, archived_at__isnull=False, is_draft=False
            ),
            request.user,
        )
        return self.list_response(request, slug, queryset)


# Grouping keys: a column on the work item, or a link table and its column.
GROUP_KEYS = {
    "state_id": ("state_id", None),
    "state__group": ("state__group", None),
    "priority": ("priority", None),
    "project_id": ("project_id", None),
    "type_id": ("type_id", None),
    "created_by": ("created_by_id", None),
    "target_date": ("target_date", None),
    "start_date": ("start_date", None),
    "labels__id": ("label_id", IssueLabel),
    "assignees__id": ("assignee_id", IssueAssignee),
    "issue_module__module_id": ("module_id", ModuleIssue),
    "cycle_id": ("cycle_id", CycleIssue),
}


def _plain(value):
    if value is None or isinstance(value, (str, int)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _key(value):
    """Group keys are JSON object keys; the empty bucket is "None", as in the app's grouped lists."""
    return "None" if value is None else str(value)


def _links(model):
    return model.objects.filter(deleted_at__isnull=True)


def _group_counts(queryset, key):
    """``[(value, count), ...]`` for one grouping key, largest first; ``None`` is the empty bucket."""
    column, link_model = GROUP_KEYS[key]
    if link_model is None:
        rows = queryset.order_by().values_list(column).annotate(count=Count("id", distinct=True))
        counts = [(_plain(value), count) for value, count in rows]
    else:
        rows = (
            _links(link_model)
            .filter(issue_id__in=queryset.values("id"))
            .order_by()
            .values_list(column)
            .annotate(count=Count("issue_id", distinct=True))
        )
        counts = [(_plain(value), count) for value, count in rows]
        empty = queryset.exclude(pk__in=_links(link_model).values("issue_id")).count()
        if empty:
            counts.append((None, empty))
    return sorted(counts, key=lambda pair: -pair[1])


def _in_group(queryset, key, value):
    column, link_model = GROUP_KEYS[key]
    if link_model is None:
        return queryset.filter(**{f"{column}__isnull": True} if value is None else {column: value})
    if value is None:
        return queryset.exclude(pk__in=_links(link_model).values("issue_id"))
    return queryset.filter(pk__in=_links(link_model).filter(**{column: value}).values("issue_id"))


class WorkItemCountAPIEndpoint(BaseAPIView):
    """Count work items across the caller's projects, optionally grouped.

    Returns ``{"total_count", "grouped_by", "sub_grouped_by", "grouped_counts"}``, where
    ``grouped_counts`` maps each group value to ``{"count": n}``, plus
    ``"sub_grouped_counts": {value: {"count": n}}`` when sub-grouped. The empty bucket is "None".
    """

    permission_classes = [WorkspaceUserPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="count_work_items",
        tags=["Work Items"],
        summary="Count work items",
        description="Count work items matching pql, optionally grouped by one or two keys.",
        parameters=[
            PQL_PARAMETER,
            OpenApiParameter(
                name="project_id", type=OpenApiTypes.UUID, location=OpenApiParameter.QUERY, required=False
            ),
            OpenApiParameter(
                name="group_by",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description=f"One of: {', '.join(GROUP_KEYS)}",
            ),
            OpenApiParameter(
                name="sub_group_by", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False
            ),
        ],
    )
    def get(self, request, slug):
        group_by = request.GET.get("group_by") or None
        sub_group_by = request.GET.get("sub_group_by") or None
        for name, key in (("group_by", group_by), ("sub_group_by", sub_group_by)):
            if key is not None and key not in GROUP_KEYS:
                return Response(
                    {name: f"Cannot group by '{key}'. Use one of: {', '.join(GROUP_KEYS)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if sub_group_by and not group_by:
            return Response({"sub_group_by": "sub_group_by needs group_by"}, status=status.HTTP_400_BAD_REQUEST)

        queryset = visible_work_items(Issue.issue_objects.filter(workspace__slug=slug), request.user)
        project_id = request.GET.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        pql = request.GET.get("pql")
        if pql:
            queryset = apply_pql(queryset, pql, PQLContext.for_request(request, slug))

        grouped_counts = {}
        if group_by:
            for value, count in _group_counts(queryset, group_by):
                entry = {"count": count}
                if sub_group_by:
                    entry["sub_grouped_counts"] = {
                        _key(sub_value): {"count": sub_count}
                        for sub_value, sub_count in _group_counts(_in_group(queryset, group_by, value), sub_group_by)
                    }
                grouped_counts[_key(value)] = entry
        result = {
            "total_count": queryset.count(),
            "grouped_by": group_by,
            "sub_grouped_by": sub_group_by,
            "grouped_counts": grouped_counts,
        }
        return Response(result, status=status.HTTP_200_OK)
