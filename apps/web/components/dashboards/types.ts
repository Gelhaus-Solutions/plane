/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TInsightsPeriod } from "@/components/analytics/insights/types";

/** Dashboards (E23): workspace pages of PQL widgets */
export type TDashboardAccess = "private" | "workspace";
export type TDashboardPeriod = "2w" | "6w" | "quarter";
export type TWidgetChart = "number" | "line" | "bars" | "rows" | "list" | "table";

export type TNumberMeasure = "count" | "created" | "done" | "resolved";
export type TTimeAxis = "created" | "done" | "resolved";
export type TRowField =
  | "project"
  | "state_group"
  | "state"
  | "priority"
  | "assignee"
  | "assignee_type"
  | "label"
  | "module"
  | "cycle"
  | "parent"
  | "created_by";
export type TSplitField = "state_group" | "priority" | "assignee_type" | "project" | "assignee" | "label";
export type TListSort = "oldest" | "newest" | "updated" | "due" | "priority";

/** What a widget draws; the server fills in what is missing with each chart's default */
export type TWidgetConfig = {
  measure?: TNumberMeasure | "running";
  x_axis?: TTimeAxis | "created_resolved" | TRowField;
  split_by?: TSplitField | "status" | "";
  sort?: TListSort;
  legend?: boolean;
  show_query?: boolean;
  totals?: boolean;
};

export type TDashboardWidget = {
  id: string;
  title: string;
  chart: TWidgetChart;
  pql: string;
  config: TWidgetConfig;
  sort_order: number;
  width: number;
  height: number;
};

export type TDashboardSummary = {
  id: string;
  name: string;
  description: string;
  access: TDashboardAccess;
  owner_id: string;
  widget_count: number;
  is_favorite: boolean;
  updated_at: string;
  can_edit: boolean;
};

export type TDashboard = TDashboardSummary & {
  period: TDashboardPeriod;
  project_ids: string[];
  pql: string;
  created_at: string;
  widgets: TDashboardWidget[];
};

export type TPQLError = { message: string; position?: number; code?: string; source?: "dashboard" };

export type TSeriesData = { key: string; name: string; values: number[] };

export type TWidgetData = {
  matched?: number;
  ms?: number;
  error?: TPQLError;
  // number
  value?: number;
  previous?: number | null;
  trend?: number[] | null;
  // line, bars
  period?: TInsightsPeriod;
  series?: TSeriesData[] | { key: string; name: string }[];
  // rows, table
  rows?: { key: string; name: string; values: number[]; total: number }[];
  // list
  items?: TWidgetItem[];
};

export type TWidgetItem = {
  id: string;
  name: string;
  key: string;
  project_id: string;
  priority: string;
  state: { name: string; color: string; group: string };
  assignee_ids: string[];
  created_at: string;
  updated_at: string;
  target_date: string | null;
};

export type TDashboardData = {
  period: TInsightsPeriod;
  error: TPQLError | null;
  widgets: Record<string, TWidgetData>;
};

/** What the address may try on a dashboard without saving it */
export type TDashboardScope = { period?: TDashboardPeriod; project_ids?: string[]; pql?: string };

export type TWidgetDraft = Omit<TDashboardWidget, "id" | "sort_order"> & { sort_order?: number };
