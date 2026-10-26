/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import useSWR, { mutate } from "swr";
// services
import { DashboardsService } from "@/services/dashboards.service";
// local imports
import type { TDashboard, TDashboardData, TDashboardPeriod, TDashboardScope, TDashboardSummary } from "./types";

export const dashboardsService = new DashboardsService();

export const PERIODS: TDashboardPeriod[] = ["2w", "6w", "quarter"];

const listKey = (workspaceSlug: string) => ["dashboards", workspaceSlug];
const dashboardKey = (workspaceSlug: string, dashboardId: string) => ["dashboard", workspaceSlug, dashboardId];

export function useDashboards(workspaceSlug: string) {
  return useSWR<TDashboardSummary[]>(workspaceSlug ? listKey(workspaceSlug) : null, () =>
    dashboardsService.list(workspaceSlug)
  );
}

export function useDashboard(workspaceSlug: string, dashboardId: string) {
  return useSWR<TDashboard>(
    workspaceSlug && dashboardId ? dashboardKey(workspaceSlug, dashboardId) : null,
    () => dashboardsService.retrieve(workspaceSlug, dashboardId),
    { revalidateOnFocus: false }
  );
}

/** The list follows changes made on a dashboard */
export const refreshDashboards = (workspaceSlug: string) => mutate(listKey(workspaceSlug));

/**
 * What the address tries on a dashboard: another period, other projects or another query, without saving them, so a
 * view of the numbers is a link. Without them the dashboard's own apply.
 */
export function useDashboardScope(dashboard: TDashboard | undefined) {
  const [params, setParams] = useSearchParams();
  const period = params.get("period");
  const projects = params.get("projects");
  const pql = params.get("pql");

  const scope = useMemo<TDashboardScope>(() => {
    const out: TDashboardScope = {};
    if (period && (PERIODS as string[]).includes(period)) out.period = period as TDashboardPeriod;
    if (projects !== null) out.project_ids = projects.split(",").filter(Boolean);
    if (pql !== null) out.pql = pql;
    return out;
  }, [period, projects, pql]);

  const effective = {
    period: scope.period ?? dashboard?.period ?? "6w",
    project_ids: scope.project_ids ?? dashboard?.project_ids ?? [],
    pql: scope.pql ?? dashboard?.pql ?? "",
  };

  const update = useCallback(
    (changes: TDashboardScope) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (changes.period !== undefined) next.set("period", changes.period);
          if (changes.project_ids !== undefined) next.set("projects", changes.project_ids.join(","));
          if (changes.pql !== undefined) next.set("pql", changes.pql);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const reset = useCallback(
    () =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          ["period", "projects", "pql"].forEach((key) => next.delete(key));
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  return { scope, effective, update, reset, tried: Object.keys(scope).length > 0 };
}

export function useDashboardData(workspaceSlug: string, dashboard: TDashboard | undefined, scope: TDashboardScope) {
  // the widgets' place and size do not change their numbers, everything else does
  const widgets = dashboard?.widgets.map((w) => `${w.id}:${w.chart}:${w.pql}:${JSON.stringify(w.config)}`).join("|");
  const saved = dashboard ? `${dashboard.period}:${dashboard.project_ids.join(",")}:${dashboard.pql}` : "";
  return useSWR<TDashboardData>(
    dashboard ? ["dashboard-data", workspaceSlug, dashboard.id, JSON.stringify(scope), saved, widgets] : null,
    () => dashboardsService.data(workspaceSlug, dashboard?.id ?? "", scope),
    { keepPreviousData: true, revalidateOnFocus: false }
  );
}
