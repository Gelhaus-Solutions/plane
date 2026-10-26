/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "@plane/types";

/** The analytics tabs (r5-10), in their order */
export const INSIGHTS_TABS = ["overview", "work-items", "cycles", "modules", "intake", "people"] as const;
export type TInsightsTab = (typeof INSIGHTS_TABS)[number];

export type TInsightsPeriod = {
  start: string;
  end: string;
  days: number;
  /** Up to a month the charts count per day, past that per week */
  bucket: "day" | "week";
  /** The first day of each bucket */
  buckets: string[];
};

export type TCompared = { value: number; previous: number };

type TProjectRef = { id: string; identifier: string; name: string };

export type TOverviewInsights = {
  period: TInsightsPeriod;
  tiles: {
    created: TCompared;
    done: TCompared;
    median_days_to_done: { value: number | null; previous: number | null };
    open: { value: number; projects: number };
  };
  series: Record<
    | "created"
    | "done"
    | "done_people"
    | "done_bots"
    | "previous_created"
    | "previous_done"
    /** Running totals at each bucket's end: every item so far, and those done or cancelled (D47) */
    | "total_running"
    | "resolved_running",
    number[]
  >;
  projects: { id: string; name: string; identifier: string; logo_props: TLogoProps; done: number; open: number }[];
};

export type TWorkItemsInsights = {
  period: TInsightsPeriod;
  data: ({ key: string; name: string; count: number } & Record<string, string | number>)[];
  /** The split's keys and their names */
  schema: Record<string, string>;
  total: number;
};

export type TCycleRow = {
  id: string;
  name: string;
  project: TProjectRef;
  start_date: string;
  end_date: string;
  status: "current" | "upcoming" | "completed";
  total: number;
  done: number;
  cancelled: number;
};

export type TCyclesInsights = {
  period: TInsightsPeriod;
  tiles: { cycles: number; current: number; completion: number | null; items: number };
  cycles: TCycleRow[];
};

export type TModuleRow = {
  id: string;
  name: string;
  project: TProjectRef;
  status: string;
  lead: { id: string; name: string } | null;
  start_date: string | null;
  target_date: string | null;
  overdue: boolean;
  total: number;
  done: number;
  open: number;
  done_in_period: number;
};

export type TModulesInsights = {
  period: TInsightsPeriod;
  tiles: { modules: number; in_progress: number; overdue: number; done_in_period: number };
  modules: TModuleRow[];
};

export type TIntakeInsights = {
  period: TInsightsPeriod;
  tiles: { received: TCompared; accepted: number; declined: number; pending: number };
  series: Record<"accepted" | "declined" | "duplicate" | "pending", number[]>;
  sources: { source: string; count: number }[];
};

export type TMemberRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  is_bot: boolean;
  open: number;
  in_progress: number;
  done: number;
  median_days_to_done: number | null;
  done_per_bucket: number[];
};

export type TPeopleInsights = { period: TInsightsPeriod; members: TMemberRow[] };
