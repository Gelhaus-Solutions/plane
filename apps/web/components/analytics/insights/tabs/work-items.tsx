/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSearchParams } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Select } from "@plane/blocks/select";
import { cn } from "@plane/utils";
// local imports
import { ChartCard, InsightsTable } from "../../charts/cards";
import { BarList, ColumnChart, Legend } from "../../charts/charts";
import { useExportTable } from "../export";
import type { TWorkItemsInsights } from "../types";
import { useInsights } from "../use-insights";
import { TabError, TOKENS } from "./common";

const K = "workspace_analytics.insights";

const AXES = [
  "STATE_GROUPS",
  "STATES",
  "PRIORITY",
  "LABELS",
  "ASSIGNEES",
  "CYCLES",
  "MODULES",
  "CREATED_BY",
  "PEOPLE_OR_BOTS",
] as const;
type TAxis = (typeof AXES)[number];
const SPLITS = ["", "PEOPLE_OR_BOTS", "STATE_GROUPS", "PRIORITY", "ASSIGNEES", "LABELS"] as const;

const AXIS_LABEL: Record<TAxis, string> = {
  STATE_GROUPS: `${K}.axis.state_groups`,
  STATES: `${K}.axis.states`,
  PRIORITY: `${K}.axis.priority`,
  LABELS: `${K}.axis.labels`,
  ASSIGNEES: `${K}.axis.assignees`,
  CYCLES: `${K}.axis.cycles`,
  MODULES: `${K}.axis.modules`,
  CREATED_BY: `${K}.axis.created_by`,
  PEOPLE_OR_BOTS: `${K}.axis.people_or_bots`,
};

// state groups in the order work moves through them
const GROUP_ORDER = ["backlog", "unstarted", "started", "completed", "cancelled"];
const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "none"];

type TOption = { id: string; label: string };

/** Names for the keys the API returns raw: state groups, priorities, people or bots */
function keyName(t: (key: string) => string, axis: string, key: string, fallback: string) {
  if (key === "none" || key === "None") return t(`${K}.none`);
  if (axis === "STATE_GROUPS") return t(`${K}.groups.${key}`);
  if (axis === "PRIORITY") return t(`issue.priority.${key}`);
  if (axis === "PEOPLE_OR_BOTS") return t(key === "bots" ? `${K}.bots` : `${K}.people`);
  return fallback;
}

function Field(props: { label: string; value: string; options: TOption[]; onChange: (id: string) => void }) {
  const { label, value, options, onChange } = props;
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-12 font-medium text-secondary">{label}</span>
      <Select<TOption>
        getValues={() => options}
        value={options.find((o) => o.id === value) ?? null}
        onChange={(id) => onChange(String(id ?? ""))}
        getOptionValue={(o) => o.id}
        getOptionLabel={(o) => o.label}
        showSearch={false}
        pinSelected={false}
      >
        <Select.Trigger variant="select-md" className="h-[30px] w-full border border-strong bg-layer-1 shadow-e1">
          <span className="flex-1 truncate text-left text-primary">{options.find((o) => o.id === value)?.label}</span>
        </Select.Trigger>
      </Select>
    </label>
  );
}

/** Work items (r5-10): a chart built from a measure, an x axis, a split and a PQL query, with its table */
export const WorkItemsTab = observer(function WorkItemsTab() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  // the builder's choices live in the address next to the filters
  const measure = params.get("measure") === "done" ? "done" : "created";
  const xAxis = (AXES as readonly string[]).includes(params.get("x") ?? "")
    ? (params.get("x") as TAxis)
    : "STATE_GROUPS";
  const split = params.get("split") ?? "PEOPLE_OR_BOTS";
  const splitBy = split === "none" || split === xAxis ? "" : split;
  const chartType = params.get("chart") === "bars" ? "bars" : "stacked";
  const pql = params.get("pql") ?? "";
  const [draft, setDraft] = useState(pql);
  useEffect(() => setDraft(pql), [pql]);

  const set = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );

  const extra = useMemo(
    () => ({
      measure,
      x_axis: xAxis,
      ...(splitBy ? { split_by: splitBy } : {}),
      ...(pql ? { pql } : {}),
    }),
    [measure, xAxis, splitBy, pql]
  );
  const { data, error } = useInsights<TWorkItemsInsights>(workspaceSlug?.toString() ?? "", "work-items", extra);
  const pqlError = (error as { pql?: { message?: string } } | undefined)?.pql?.message;

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    const order = xAxis === "STATE_GROUPS" ? GROUP_ORDER : xAxis === "PRIORITY" ? PRIORITY_ORDER : null;
    return order ? sortBy(list, (row) => order.indexOf(String(row.key))) : list;
  }, [data, xAxis]);
  const series = useMemo(() => {
    if (!splitBy) return [{ name: t(`${K}.items`), token: TOKENS[0], values: rows.map((row) => row.count) }];
    const keys = Object.keys(data?.schema ?? {});
    const order = splitBy === "STATE_GROUPS" ? GROUP_ORDER : splitBy === "PRIORITY" ? PRIORITY_ORDER : null;
    const ordered =
      splitBy === "PEOPLE_OR_BOTS"
        ? ["people", "bots"].filter((k) => keys.includes(k))
        : order
          ? sortBy(keys, (key) => order.indexOf(key))
          : keys;
    return ordered.map((key, i) => ({
      name: keyName(t, splitBy, key, data?.schema[key] ?? key),
      token: TOKENS[i % TOKENS.length],
      values: rows.map((row) => Number(row[key] ?? 0)),
    }));
  }, [data, rows, splitBy, t]);
  const categories = useMemo(
    () => rows.map((row) => keyName(t, xAxis, String(row.key), String(row.name))),
    [rows, xAxis, t]
  );
  const axisLabel = t(AXIS_LABEL[xAxis]);

  const exportTable = useMemo(
    () =>
      data
        ? {
            name: `analytics-work-items-${data.period.start}-${data.period.end}`,
            rows: categories.map((category, i) => ({
              [axisLabel]: category,
              ...Object.fromEntries(series.map((s) => [s.name, s.values[i] ?? 0])),
              [t(`${K}.total`)]: rows[i]?.count ?? 0,
            })),
          }
        : null,
    [data, rows, categories, series, axisLabel, t]
  );
  useExportTable(exportTable);

  const axisOptions = AXES.map((axis) => ({ id: axis, label: t(AXIS_LABEL[axis]) }));
  const splitOptions = SPLITS.map((s) => ({ id: s, label: s ? t(AXIS_LABEL[s]) : t(`${K}.split_none`) }));

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-strong p-3.5">
        <span className="text-[10.5px] font-semibold tracking-[0.08em] text-tertiary uppercase">{t(`${K}.chart`)}</span>
        <Field
          label={t(`${K}.measure`)}
          value={measure}
          options={[
            { id: "created", label: t(`${K}.measure_created`) },
            { id: "done", label: t(`${K}.measure_done`) },
          ]}
          onChange={(id) => set("measure", id === "done" ? "done" : "")}
        />
        <Field label={t(`${K}.x_axis`)} value={xAxis} options={axisOptions} onChange={(id) => set("x", id)} />
        <Field
          label={t(`${K}.split_by`)}
          value={split === "none" ? "" : split}
          options={splitOptions}
          onChange={(id) => set("split", id || "none")}
        />
        <Field
          label={t(`${K}.chart_type`)}
          value={chartType}
          options={[
            { id: "stacked", label: t(`${K}.stacked_columns`) },
            { id: "bars", label: t(`${K}.bars`) },
          ]}
          onChange={(id) => set("chart", id === "bars" ? "bars" : "")}
        />
        <label className="flex flex-col gap-[5px]">
          <span className="text-12 font-medium text-secondary">{t(`${K}.only_matching`)}</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft.trim() !== pql && set("pql", draft.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                set("pql", draft.trim());
              }
            }}
            rows={3}
            spellCheck={false}
            aria-invalid={!!pqlError}
            placeholder={t(`${K}.pql_placeholder`)}
            className={cn(
              "min-h-[30px] resize-y rounded-lg border border-strong bg-surface-2 px-2 py-1.5 font-code text-[11.5px] leading-normal text-primary outline-none placeholder:text-placeholder focus:border-accent-strong",
              { "border-danger-strong focus:border-danger-strong": !!pqlError }
            )}
          />
          {pqlError && (
            <span role="alert" className="text-12 text-danger-primary">
              {pqlError}
            </span>
          )}
        </label>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-auto px-[18px] py-4">
        {error && !data && !pqlError ? (
          <TabError />
        ) : (
          <>
            <ChartCard
              title={t(`${K}.by_axis`, { axis: t(AXIS_LABEL[xAxis].replace(".axis.", ".axis_in_title.")) })}
              sub={
                data
                  ? `${t(`${K}.items_count`, { count: data.total })}, ${t(`${K}.last_days`, { days: data.period.days })}`
                  : undefined
              }
            >
              {series.length > 1 && <Legend series={series.map((s) => ({ name: s.name, token: s.token }))} />}
              {!data ? (
                <div className="h-60 animate-pulse rounded-lg bg-layer-2" />
              ) : chartType === "bars" ? (
                <BarList
                  series={series.map((s) => ({ name: s.name, token: s.token }))}
                  rows={categories.map((category, i) => ({
                    key: String(rows[i]?.key ?? i),
                    label: <span className="truncate">{category}</span>,
                    values: series.map((s) => s.values[i] ?? 0),
                  }))}
                />
              ) : (
                <ColumnChart
                  categories={categories}
                  keys={rows.map((row) => String(row.key))}
                  series={series}
                  totals="all"
                  totalLabel={t(`${K}.total`)}
                  width={640}
                  height={230}
                />
              )}
            </ChartCard>
            <ChartCard title={t(`${K}.table`)} sub={t(`${K}.same_data`)}>
              <InsightsTable
                columns={[
                  { key: "category", label: axisLabel, width: "minmax(0,1fr)" },
                  ...(series.length > 1
                    ? series.map((s, i) => ({ key: `s${i}`, label: s.name, width: "90px", align: "right" as const }))
                    : []),
                  { key: "total", label: t(`${K}.total`), width: "90px", align: "right", strong: true },
                ]}
                rows={categories.map((category, i) => ({
                  key: String(rows[i]?.key ?? i),
                  cells: {
                    category,
                    ...Object.fromEntries(series.map((s, k) => [`s${k}`, s.values[i] ?? 0])),
                    total: rows[i]?.count ?? 0,
                  },
                }))}
              />
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
});
