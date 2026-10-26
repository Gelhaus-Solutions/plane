/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { TDashboard, TWidgetDraft } from "./types";

export type TTemplateKey = "cycle_health" | "bot_activity" | "throughput" | "blank";
export const TEMPLATE_KEYS: TTemplateKey[] = ["cycle_health", "bot_activity", "throughput", "blank"];

type TTranslate = (key: string, params?: Record<string, unknown>) => string;
type TTemplate = Pick<TDashboard, "name" | "description" | "period" | "pql"> & { widgets: TWidgetDraft[] };

const OPEN = "stateGroup IN openStates()";
const REVIEW = 'stateGroup = "Review"';

const number = (title: string, measure: string, pql = ""): TWidgetDraft => ({
  title,
  chart: "number",
  pql,
  config: { measure: measure as TWidgetDraft["config"]["measure"] },
  width: 3,
  height: 3,
});

/**
 * The templates of r5-20, Release readiness swapped for Throughput until releases exist (D47). Titles are written in
 * the viewer's language when the dashboard is made, and are theirs to change after.
 */
export function buildTemplate(key: TTemplateKey, t: TTranslate): TTemplate {
  const w = (k: string) => t(`dashboards.templates.widgets.${k}`);
  const base = {
    name: t(`dashboards.templates.${key}.name`),
    description: t(`dashboards.templates.${key}.description`),
  };
  switch (key) {
    case "throughput":
      return {
        ...base,
        period: "quarter",
        pql: "",
        widgets: [
          number(w("created"), "created"),
          number(w("resolved"), "resolved"),
          number(w("open_now"), "count", OPEN),
          number(w("in_review"), "count", REVIEW),
          {
            title: w("total_and_resolved"),
            chart: "line",
            pql: "",
            config: { measure: "running", x_axis: "created_resolved" },
            width: 8,
            height: 7,
          },
          {
            title: w("done_people_bots"),
            chart: "bars",
            pql: "",
            config: { x_axis: "done", split_by: "assignee_type" },
            width: 4,
            height: 7,
          },
          {
            title: w("open_by_project"),
            chart: "rows",
            pql: OPEN,
            config: { x_axis: "project", split_by: "state_group" },
            width: 6,
            height: 7,
          },
          { title: w("oldest_open"), chart: "list", pql: OPEN, config: { sort: "oldest" }, width: 6, height: 7 },
        ],
      };
    case "cycle_health":
      return {
        ...base,
        period: "6w",
        pql: "cycle IN activeCycle()",
        widgets: [
          number(w("open"), "count", OPEN),
          number(w("done"), "done"),
          number(w("overdue"), "count", "isOverdue()"),
          number(w("in_review"), "count", REVIEW),
          {
            title: w("burnup"),
            chart: "line",
            pql: "",
            config: { measure: "running", x_axis: "created_resolved" },
            width: 7,
            height: 7,
          },
          {
            title: w("by_cycle"),
            chart: "rows",
            pql: "",
            config: { x_axis: "cycle", split_by: "status" },
            width: 5,
            height: 7,
          },
          {
            title: w("overdue_soonest"),
            chart: "list",
            pql: "isOverdue()",
            config: { sort: "due" },
            width: 6,
            height: 7,
          },
          { title: w("review_oldest"), chart: "list", pql: REVIEW, config: { sort: "oldest" }, width: 6, height: 7 },
        ],
      };
    case "bot_activity":
      return {
        ...base,
        period: "6w",
        pql: "",
        widgets: [
          number(w("resolved"), "resolved"),
          number(w("in_review"), "count", REVIEW),
          number(w("claimed_now"), "count", "claimedBy IS NOT NULL"),
          number(w("open_now"), "count", OPEN),
          {
            title: w("done_people_bots"),
            chart: "bars",
            pql: "",
            config: { x_axis: "done", split_by: "assignee_type", totals: true },
            width: 7,
            height: 7,
          },
          {
            title: w("by_assignee"),
            chart: "rows",
            pql: OPEN,
            config: { x_axis: "assignee", split_by: "assignee_type" },
            width: 5,
            height: 7,
          },
          { title: w("review_oldest"), chart: "list", pql: REVIEW, config: { sort: "oldest" }, width: 6, height: 7 },
          {
            title: w("claimed"),
            chart: "list",
            pql: "claimedBy IS NOT NULL",
            config: { sort: "updated" },
            width: 6,
            height: 7,
          },
        ],
      };
    case "blank":
      return { ...base, period: "6w", pql: "", widgets: [] };
  }
}
