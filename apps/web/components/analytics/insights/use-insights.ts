/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { format, subDays } from "date-fns";
import { useSearchParams } from "react-router";
import useSWR from "swr";
// services
import { AnalyticsService } from "@/services/analytics.service";
// local imports
import type { TInsightsTab } from "./types";

const analyticsService = new AnalyticsService();

/** The periods a click away; anything else is Custom */
export const PRESET_DAYS = ["7", "30", "90"] as const;
const DEFAULT_PERIOD = "90";

const isoDate = (date: Date) => format(date, "yyyy-MM-dd");

/**
 * The analytics filters live in the address (?period=, ?start=&end= for Custom, ?projects=, ?compare=1), so a view
 * of the numbers is a link and survives a tab change.
 */
export function useInsightsFilters() {
  const [params, setParams] = useSearchParams();
  const period = params.get("period") ?? DEFAULT_PERIOD;
  const customStart = params.get("start");
  const customEnd = params.get("end");
  const projects = params.get("projects");
  const compare = params.get("compare") === "1";
  // Created and done per bucket, or the running totals of all items and the resolved ones
  const running = params.get("flow") === "running";

  const range = useMemo(() => {
    if (period === "custom" && customStart && customEnd) return { start: customStart, end: customEnd };
    const days = Number(period) || Number(DEFAULT_PERIOD);
    const end = new Date();
    return { start: isoDate(subDays(end, days - 1)), end: isoDate(end) };
  }, [period, customStart, customEnd]);

  const projectIds = useMemo(() => (projects ? projects.split(",").filter(Boolean) : []), [projects]);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const query = useMemo(
    () => ({ start: range.start, end: range.end, ...(projectIds.length ? { project_ids: projectIds.join(",") } : {}) }),
    [range, projectIds]
  );

  return { period, range, projectIds, compare, running, update, query };
}

/** One tab's numbers for the filters in the address; the last answer stays on screen while the next one loads */
export function useInsights<T>(workspaceSlug: string, tab: TInsightsTab, extra?: Record<string, string>) {
  const { query } = useInsightsFilters();
  const params = useMemo(() => ({ tab, ...query, ...extra }), [tab, query, extra]);
  return useSWR<T>(
    workspaceSlug ? ["analytics-insights", workspaceSlug, JSON.stringify(params)] : null,
    () => analyticsService.getInsights<T>(workspaceSlug, params),
    { keepPreviousData: true, revalidateOnFocus: false }
  );
}
