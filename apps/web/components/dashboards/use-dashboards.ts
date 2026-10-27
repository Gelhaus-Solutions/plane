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

// the workspace's list and each project's are cached apart
const listKey = (workspaceSlug: string, projectId?: string) => ["dashboards", workspaceSlug, projectId ?? ""];
const dashboardKey = (workspaceSlug: string, dashboardId: string) => ["dashboard", workspaceSlug, dashboardId];

/** Every dashboard you can open, or with a project the ones that count it */
export function useDashboards(workspaceSlug: string, projectId?: string) {
  return useSWR<TDashboardSummary[]>(workspaceSlug ? listKey(workspaceSlug, projectId) : null, () =>
    dashboardsService.list(workspaceSlug, projectId)
  );
}

export function useDashboard(workspaceSlug: string, dashboardId: string) {
  return useSWR<TDashboard>(
    workspaceSlug && dashboardId ? dashboardKey(workspaceSlug, dashboardId) : null,
    () => dashboardsService.retrieve(workspaceSlug, dashboardId),
    { revalidateOnFocus: false }
  );
}

/** The lists follow changes made on a dashboard: the workspace's and every project's */
export const refreshDashboards = (workspaceSlug: string) =>
  mutate((key) => Array.isArray(key) && key[0] === "dashboards" && key[1] === workspaceSlug);

/**
 * What the address tries on a dashboard: another period, other projects or another query, without saving them, so a
 * view of the numbers is a link. Without them the dashboard's own apply. Opened from a project (the lens), it counts
 * that project alone and the projects in the address do not apply.
 */
export function useDashboardScope(dashboard: TDashboard | undefined, projectId?: string) {
  const [params, setParams] = useSearchParams();
  const period = params.get("period");
  const projects = projectId ? null : params.get("projects");
  const pql = params.get("pql");

  const fromAddress = useMemo<TDashboardScope>(() => {
    const out: TDashboardScope = {};
    if (period && (PERIODS as string[]).includes(period)) out.period = period as TDashboardPeriod;
    if (projects !== null) out.project_ids = projects.split(",").filter(Boolean);
    if (pql !== null) out.pql = pql;
    return out;
  }, [period, projects, pql]);
  const scope = useMemo<TDashboardScope>(
    () => (projectId ? { ...fromAddress, project: projectId } : fromAddress),
    [fromAddress, projectId]
  );

  const effective = {
    period: fromAddress.period ?? dashboard?.period ?? "6w",
    project_ids: fromAddress.project_ids ?? dashboard?.project_ids ?? [],
    pql: fromAddress.pql ?? dashboard?.pql ?? "",
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

  return { scope, effective, update, reset, tried: Object.keys(fromAddress).length > 0 };
}

/** Whether a dashboard counts a project: its projects include it, or it has none and counts every project */
export const countsProject = (dashboard: Pick<TDashboard, "project_ids">, projectId: string) =>
  !dashboard.project_ids.length || dashboard.project_ids.includes(projectId);

export function useDashboardData(workspaceSlug: string, dashboard: TDashboard | undefined, scope: TDashboardScope) {
  // the widgets' place and size do not change their numbers, everything else does
  const widgets = dashboard?.widgets.map((w) => `${w.id}:${w.chart}:${w.pql}:${JSON.stringify(w.config)}`).join("|");
  const saved = dashboard ? `${dashboard.period}:${dashboard.project_ids.join(",")}:${dashboard.pql}` : "";
  // a lens on a project the dashboard does not count is refused, so it is not asked
  const refused = !!dashboard && !!scope.project && !countsProject(dashboard, scope.project);
  return useSWR<TDashboardData>(
    dashboard && !refused
      ? ["dashboard-data", workspaceSlug, dashboard.id, JSON.stringify(scope), saved, widgets]
      : null,
    () => dashboardsService.data(workspaceSlug, dashboard?.id ?? "", scope),
    { keepPreviousData: true, revalidateOnFocus: false }
  );
}
