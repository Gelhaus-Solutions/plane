# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dashboards (E23): workspace pages of PQL widgets. A private dashboard is its owner's; a workspace dashboard every
member sees and can duplicate, and its owner and the workspace's admins edit it (D47)."""

import uuid

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from rest_framework import serializers, status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.analytic.insights import Period
from plane.db.models import (
    Dashboard,
    DashboardFavorite,
    DashboardWidget,
    Issue,
    Project,
    Workspace,
    WorkspaceMember,
)
from plane.db.models.dashboard import DASHBOARD_ACCESS, DASHBOARD_PERIODS, WIDGET_CHARTS
from plane.utils.dashboard_data import PERIOD_DAYS, Scope, clean_config, widget_data
from plane.utils.pql.backend import PQLQueryError, apply_pql
from plane.utils.pql.compiler import PQLContext

from .. import BaseAPIView

MAX_WIDGETS = 40


class WidgetSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    chart = serializers.ChoiceField(choices=WIDGET_CHARTS)
    pql = serializers.CharField(required=False, allow_blank=True, default="", max_length=4000)
    config = serializers.DictField(required=False, default=dict)
    width = serializers.IntegerField(required=False, min_value=1, max_value=12, default=6)
    height = serializers.IntegerField(required=False, min_value=2, max_value=16, default=7)


class DashboardSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    access = serializers.ChoiceField(choices=DASHBOARD_ACCESS, required=False)
    period = serializers.ChoiceField(choices=DASHBOARD_PERIODS, required=False)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=200)
    pql = serializers.CharField(required=False, allow_blank=True, max_length=4000)


class LayoutEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    sort_order = serializers.FloatField()
    width = serializers.IntegerField(min_value=1, max_value=12)
    height = serializers.IntegerField(min_value=2, max_value=16)


def widget_dict(widget):
    return {
        "id": str(widget.id),
        "title": widget.title,
        "chart": widget.chart,
        "pql": widget.pql,
        "config": clean_config(widget.chart, widget.config),
        "sort_order": widget.sort_order,
        "width": widget.width,
        "height": widget.height,
    }


class DashboardBase(BaseAPIView):
    def visible(self, slug):
        """The dashboards the viewer may open: every workspace dashboard and their own private ones."""
        return Dashboard.objects.filter(workspace__slug=slug).filter(Q(access="workspace") | Q(owner=self.request.user))

    def is_admin(self, slug):
        return WorkspaceMember.objects.filter(
            workspace__slug=slug, member=self.request.user, role=ROLE.ADMIN.value, is_active=True
        ).exists()

    def can_edit(self, dashboard, slug):
        return dashboard.owner_id == self.request.user.id or (dashboard.access == "workspace" and self.is_admin(slug))

    def get_dashboard(self, slug, pk):
        return self.visible(slug).filter(pk=pk).first()

    def editable(self, slug, pk):
        """The dashboard and None, or None and the response refusing the edit."""
        dashboard = self.get_dashboard(slug, pk)
        if dashboard is None:
            return None, Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self.can_edit(dashboard, slug):
            return None, Response(
                {"error": "Only its owner and workspace admins edit this dashboard"}, status=status.HTTP_403_FORBIDDEN
            )
        return dashboard, None

    def context(self, slug):
        return PQLContext.for_request(self.request, slug)

    def bad_pql(self, slug, *queries):
        """The first query that does not compile, as an error body, or None."""
        for text in queries:
            if text and text.strip():
                try:
                    apply_pql(Issue.objects.none(), text, self.context(slug))
                except PQLQueryError as error:
                    return {"pql": error.detail["pql"]}
        return None

    def member_projects(self, slug):
        return Project.objects.filter(
            workspace__slug=slug,
            project_projectmember__member=self.request.user,
            project_projectmember__is_active=True,
            archived_at__isnull=True,
        ).values_list("id", flat=True)

    def scope(self, slug, dashboard, params):
        """What the dashboard's widgets count for this viewer; the request may try another period, projects or query
        without saving them."""
        period_key = params.get("period") if params.get("period") in PERIOD_DAYS else dashboard.period
        wanted = params.get("project_ids")
        if wanted is None:
            wanted = dashboard.project_ids
        pql = params.get("pql") if params.get("pql") is not None else dashboard.pql
        return self.scope_of(slug, period_key, wanted, pql)

    def scope_of(self, slug, period_key, project_ids, pql):
        """The viewer's projects, narrowed to project_ids (a list, or ids separated by commas) when given."""
        if isinstance(project_ids, str):
            project_ids = project_ids.split(",")
        wanted = []
        for value in project_ids or []:
            try:
                wanted.append(uuid.UUID(str(value).strip()))
            except ValueError:
                continue
        projects = self.member_projects(slug)
        if wanted:
            projects = projects.filter(id__in=wanted)
        period = Period.last_days(self.request.user, PERIOD_DAYS[period_key])
        return Scope(list(projects), pql, period, self.context(slug))

    def dashboard_dict(self, dashboard, slug, widgets=False):
        data = {
            "id": str(dashboard.id),
            "name": dashboard.name,
            "description": dashboard.description,
            "access": dashboard.access,
            "period": dashboard.period,
            "project_ids": [str(p) for p in dashboard.project_ids],
            "pql": dashboard.pql,
            "owner_id": str(dashboard.owner_id),
            "created_at": dashboard.created_at,
            "updated_at": dashboard.updated_at,
            "can_edit": self.can_edit(dashboard, slug),
            "is_favorite": DashboardFavorite.objects.filter(dashboard=dashboard, user=self.request.user).exists(),
        }
        if widgets:
            data["widgets"] = [widget_dict(w) for w in dashboard.widgets.all()]
        data["widget_count"] = dashboard.widgets.count()
        return data

    def touch(self, dashboard):
        dashboard.save(update_fields=["updated_at"])


class DashboardListEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        admin = self.is_admin(slug)
        dashboards = (
            self.visible(slug)
            .annotate(
                widget_count=Count("widgets", filter=Q(widgets__deleted_at__isnull=True)),
                is_favorite=Exists(DashboardFavorite.objects.filter(dashboard_id=OuterRef("pk"), user=request.user)),
            )
            .order_by("-updated_at")
        )
        return Response(
            [
                {
                    "id": str(d.id),
                    "name": d.name,
                    "description": d.description,
                    "access": d.access,
                    "owner_id": str(d.owner_id),
                    "widget_count": d.widget_count,
                    "is_favorite": d.is_favorite,
                    "updated_at": d.updated_at,
                    "can_edit": d.owner_id == request.user.id or (d.access == "workspace" and admin),
                }
                for d in dashboards
            ],
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        """A new dashboard, with the widgets of a template when they come along."""
        serializer = DashboardSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        widgets = WidgetSerializer(data=request.data.get("widgets") or [], many=True)
        if not widgets.is_valid():
            return Response({"widgets": widgets.errors}, status=status.HTTP_400_BAD_REQUEST)
        if len(widgets.validated_data) > MAX_WIDGETS:
            return Response({"error": f"At most {MAX_WIDGETS} widgets"}, status=status.HTTP_400_BAD_REQUEST)
        values = serializer.validated_data
        error = self.bad_pql(slug, values.get("pql"), *(w["pql"] for w in widgets.validated_data))
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        with transaction.atomic():
            dashboard = Dashboard.objects.create(
                workspace=workspace,
                owner=request.user,
                name=values["name"],
                description=values.get("description", ""),
                access=values.get("access", "private"),
                period=values.get("period", "6w"),
                project_ids=[str(p) for p in values.get("project_ids", [])],
                pql=values.get("pql", ""),
            )
            DashboardWidget.objects.bulk_create(
                [
                    DashboardWidget(
                        dashboard=dashboard,
                        title=w["title"],
                        chart=w["chart"],
                        pql=w["pql"],
                        config=clean_config(w["chart"], w["config"]),
                        width=w["width"],
                        height=w["height"],
                        sort_order=(i + 1) * 1000,
                        created_by=request.user,
                    )
                    for i, w in enumerate(widgets.validated_data)
                ]
            )
        return Response(self.dashboard_dict(dashboard, slug, widgets=True), status=status.HTTP_201_CREATED)


class DashboardDetailEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, pk):
        dashboard = self.get_dashboard(slug, pk)
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.dashboard_dict(dashboard, slug, widgets=True), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, pk):
        dashboard, refused = self.editable(slug, pk)
        if refused:
            return refused
        serializer = DashboardSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        values = serializer.validated_data
        if "access" in values and values["access"] != dashboard.access and dashboard.owner_id != request.user.id:
            # an admin may edit a workspace dashboard, but making it private would take it from its owner's team
            return Response({"error": "Only its owner changes who sees it"}, status=status.HTTP_403_FORBIDDEN)
        error = self.bad_pql(slug, values.get("pql"))
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        for field, value in values.items():
            setattr(dashboard, field, [str(p) for p in value] if field == "project_ids" else value)
        dashboard.save()
        return Response(self.dashboard_dict(dashboard, slug, widgets=True), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, pk):
        dashboard = self.get_dashboard(slug, pk)
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        # deleting is the owner's, or an admin's for a workspace dashboard
        if not self.can_edit(dashboard, slug):
            return Response(
                {"error": "Only its owner and workspace admins delete it"}, status=status.HTTP_403_FORBIDDEN
            )
        dashboard.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DashboardDuplicateEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        """A private copy for the viewer, widgets and all."""
        source = self.get_dashboard(slug, pk)
        if source is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        name = str(request.data.get("name") or f"{source.name} copy")[:255]
        with transaction.atomic():
            copy = Dashboard.objects.create(
                workspace_id=source.workspace_id,
                owner=request.user,
                name=name,
                description=source.description,
                access="private",
                period=source.period,
                project_ids=source.project_ids,
                pql=source.pql,
            )
            DashboardWidget.objects.bulk_create(
                [
                    DashboardWidget(
                        dashboard=copy,
                        title=w.title,
                        chart=w.chart,
                        pql=w.pql,
                        config=w.config,
                        width=w.width,
                        height=w.height,
                        sort_order=w.sort_order,
                        created_by=request.user,
                    )
                    for w in source.widgets.all()
                ]
            )
        return Response(self.dashboard_dict(copy, slug, widgets=True), status=status.HTTP_201_CREATED)


class DashboardFavoriteEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        dashboard = self.get_dashboard(slug, pk)
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        DashboardFavorite.objects.get_or_create(dashboard=dashboard, user=request.user)
        return Response({"is_favorite": True}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, pk):
        DashboardFavorite.objects.filter(dashboard_id=pk, dashboard__workspace__slug=slug, user=request.user).delete(
            soft=False
        )
        return Response({"is_favorite": False}, status=status.HTTP_200_OK)


class DashboardWidgetsEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        dashboard, refused = self.editable(slug, pk)
        if refused:
            return refused
        serializer = WidgetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if dashboard.widgets.count() >= MAX_WIDGETS:
            return Response({"error": f"At most {MAX_WIDGETS} widgets"}, status=status.HTTP_400_BAD_REQUEST)
        values = serializer.validated_data
        error = self.bad_pql(slug, values["pql"])
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        last = dashboard.widgets.order_by("-sort_order").values_list("sort_order", flat=True).first()
        sort_order = request.data.get("sort_order")
        widget = DashboardWidget.objects.create(
            dashboard=dashboard,
            title=values["title"],
            chart=values["chart"],
            pql=values["pql"],
            config=clean_config(values["chart"], values["config"]),
            width=values["width"],
            height=values["height"],
            sort_order=float(sort_order) if isinstance(sort_order, (int, float)) else (last or 0) + 1000,
        )
        self.touch(dashboard)
        return Response(widget_dict(widget), status=status.HTTP_201_CREATED)


class DashboardWidgetDetailEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, pk, widget_id):
        dashboard, refused = self.editable(slug, pk)
        if refused:
            return refused
        widget = dashboard.widgets.filter(pk=widget_id).first()
        if widget is None:
            return Response({"error": "Widget not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = WidgetSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        values = serializer.validated_data
        error = self.bad_pql(slug, values.get("pql"))
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        for field, value in values.items():
            setattr(widget, field, value)
        widget.config = clean_config(widget.chart, widget.config)
        widget.save()
        self.touch(dashboard)
        return Response(widget_dict(widget), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, pk, widget_id):
        dashboard, refused = self.editable(slug, pk)
        if refused:
            return refused
        dashboard.widgets.filter(pk=widget_id).delete()
        self.touch(dashboard)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DashboardLayoutEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        """Places and sizes for the widgets, after a drag or a resize."""
        dashboard, refused = self.editable(slug, pk)
        if refused:
            return refused
        serializer = LayoutEntrySerializer(data=request.data.get("widgets") or [], many=True)
        if not serializer.is_valid():
            return Response({"widgets": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        widgets = {w.id: w for w in dashboard.widgets.all()}
        changed = []
        for entry in serializer.validated_data:
            widget = widgets.get(entry["id"])
            if widget is None:
                continue
            widget.sort_order, widget.width, widget.height = entry["sort_order"], entry["width"], entry["height"]
            changed.append(widget)
        DashboardWidget.objects.bulk_update(changed, ["sort_order", "width", "height"])
        self.touch(dashboard)
        return Response([widget_dict(w) for w in dashboard.widgets.all()], status=status.HTTP_200_OK)


class DashboardDataEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, pk):
        """Every widget's numbers, for the dashboard's period, projects and query or the ones the address tries."""
        dashboard = self.get_dashboard(slug, pk)
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        scope = self.scope(slug, dashboard, request.GET)
        return Response(
            {
                "period": scope.period.as_dict(),
                "error": scope.error,
                "widgets": {str(w.id): widget_data(scope, w.chart, w.pql, w.config) for w in dashboard.widgets.all()},
            },
            status=status.HTTP_200_OK,
        )


class DashboardPreviewEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        """An unsaved widget's numbers, for the editor's preview."""
        dashboard = self.get_dashboard(slug, pk)
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        chart = request.data.get("chart")
        if chart not in dict(WIDGET_CHARTS):
            return Response({"error": "Unknown chart"}, status=status.HTTP_400_BAD_REQUEST)
        scope = self.scope(slug, dashboard, request.data.get("scope") or {})
        data = widget_data(scope, chart, str(request.data.get("pql") or ""), request.data.get("config") or {})
        return Response(
            {"period": scope.period.as_dict(), "config": clean_config(chart, request.data.get("config")), **data},
            status=status.HTTP_200_OK,
        )


class DashboardChartEndpoint(DashboardBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        """One chart's numbers without a dashboard, for agents and the API: a chart, its query and settings, over a
        period and the caller's projects."""
        chart = request.data.get("chart")
        if chart not in dict(WIDGET_CHARTS):
            return Response(
                {"error": f"chart must be one of: {', '.join(dict(WIDGET_CHARTS))}"}, status=status.HTTP_400_BAD_REQUEST
            )
        period_key = request.data.get("period") or "6w"
        if period_key not in PERIOD_DAYS:
            return Response(
                {"error": f"period must be one of: {', '.join(PERIOD_DAYS)}"}, status=status.HTTP_400_BAD_REQUEST
            )
        scope = self.scope_of(slug, period_key, request.data.get("project_ids") or [], "")
        config = request.data.get("config") or {}
        data = widget_data(scope, chart, str(request.data.get("pql") or ""), config)
        return Response(
            {"period": scope.period.as_dict(), "chart": chart, "config": clean_config(chart, config), **data},
            status=status.HTTP_200_OK,
        )
