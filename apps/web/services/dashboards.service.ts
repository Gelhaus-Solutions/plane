/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// local imports
import type {
  TDashboard,
  TDashboardData,
  TDashboardScope,
  TDashboardSummary,
  TDashboardWidget,
  TWidgetChart,
  TWidgetConfig,
  TWidgetData,
  TWidgetDraft,
} from "@/components/dashboards/types";
import type { TInsightsPeriod } from "@/components/analytics/insights/types";
import { APIService } from "./api.service";

type TLayoutEntry = Pick<TDashboardWidget, "id" | "sort_order" | "width" | "height">;

/** Dashboards of PQL widgets (E23) */
export class DashboardsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string, ...parts: string[]) {
    return [`/api/workspaces/${workspaceSlug}/dashboards`, ...parts, ""].join("/");
  }

  private async send<T>(request: Promise<{ data: T }>): Promise<T> {
    return request
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** Every dashboard you can open, or with a project only those that count it */
  list(workspaceSlug: string, projectId?: string) {
    const params = projectId ? { project: projectId } : {};
    return this.send<TDashboardSummary[]>(this.get(this.url(workspaceSlug), { params }));
  }

  create(workspaceSlug: string, data: Partial<Omit<TDashboard, "widgets">> & { widgets?: TWidgetDraft[] }) {
    return this.send<TDashboard>(this.post(this.url(workspaceSlug), data));
  }

  retrieve(workspaceSlug: string, dashboardId: string) {
    return this.send<TDashboard>(this.get(this.url(workspaceSlug, dashboardId)));
  }

  update(workspaceSlug: string, dashboardId: string, data: Partial<TDashboard>) {
    return this.send<TDashboard>(this.patch(this.url(workspaceSlug, dashboardId), data));
  }

  remove(workspaceSlug: string, dashboardId: string) {
    return this.send<void>(this.delete(this.url(workspaceSlug, dashboardId)));
  }

  duplicate(workspaceSlug: string, dashboardId: string, name?: string) {
    return this.send<TDashboard>(this.post(this.url(workspaceSlug, dashboardId, "duplicate"), name ? { name } : {}));
  }

  setFavorite(workspaceSlug: string, dashboardId: string, favorite: boolean) {
    const url = this.url(workspaceSlug, dashboardId, "favorite");
    return this.send<{ is_favorite: boolean }>(favorite ? this.post(url) : this.delete(url));
  }

  addWidget(workspaceSlug: string, dashboardId: string, data: TWidgetDraft) {
    return this.send<TDashboardWidget>(this.post(this.url(workspaceSlug, dashboardId, "widgets"), data));
  }

  updateWidget(workspaceSlug: string, dashboardId: string, widgetId: string, data: Partial<TWidgetDraft>) {
    return this.send<TDashboardWidget>(this.patch(this.url(workspaceSlug, dashboardId, "widgets", widgetId), data));
  }

  removeWidget(workspaceSlug: string, dashboardId: string, widgetId: string) {
    return this.send<void>(this.delete(this.url(workspaceSlug, dashboardId, "widgets", widgetId)));
  }

  saveLayout(workspaceSlug: string, dashboardId: string, widgets: TLayoutEntry[]) {
    return this.send<TDashboardWidget[]>(this.post(this.url(workspaceSlug, dashboardId, "layout"), { widgets }));
  }

  data(workspaceSlug: string, dashboardId: string, scope: TDashboardScope) {
    const params: Record<string, string> = {};
    if (scope.period) params.period = scope.period;
    // a project lens counts that project alone, so the projects tried in the address do not apply
    if (scope.project) params.project = scope.project;
    else if (scope.project_ids) params.project_ids = scope.project_ids.join(",");
    if (scope.pql !== undefined) params.pql = scope.pql;
    return this.send<TDashboardData>(this.get(this.url(workspaceSlug, dashboardId, "data"), { params }));
  }

  preview(
    workspaceSlug: string,
    dashboardId: string,
    widget: { chart: TWidgetChart; pql: string; config: TWidgetConfig },
    scope: TDashboardScope
  ) {
    return this.send<TWidgetData & { period: TInsightsPeriod; config: TWidgetConfig }>(
      this.post(this.url(workspaceSlug, dashboardId, "preview"), { ...widget, scope })
    );
  }
}
