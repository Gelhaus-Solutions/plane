/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ProjectBadge } from "@plane/blocks/project-badge";
// local imports
import { ChartCard, InsightsTable, percentDelta, Segmented, StatTile } from "../../charts/cards";
import type { TSeries } from "../../charts/charts";
import { BarList, ColumnChart, formatNumber, Legend, LineChart } from "../../charts/charts";
import { useExportTable } from "../export";
import type { TOverviewInsights } from "../types";
import { useInsights, useInsightsFilters } from "../use-insights";
import { TabBody, TabError, TabLoading, TileRow, usePeriodWords } from "./common";

const K = "workspace_analytics.insights";

/** Overview (r5-10): four tiles against the previous period, created and done, people and bots, and by project */
export const OverviewTab = observer(function OverviewTab() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { compare, running, update } = useInsightsFilters();
  const { data, error } = useInsights<TOverviewInsights>(workspaceSlug?.toString() ?? "", "overview");
  const { labels, per, bucketColumn } = usePeriodWords(data?.period);

  const exportTable = useMemo(
    () =>
      data
        ? {
            name: `analytics-overview-${data.period.start}-${data.period.end}`,
            rows: data.period.buckets.map((bucket, i) => ({
              [bucketColumn]: bucket,
              [t(`${K}.created`)]: data.series.created[i] ?? 0,
              [t(`${K}.done`)]: data.series.done[i] ?? 0,
              [t(`${K}.people`)]: data.series.done_people[i] ?? 0,
              [t(`${K}.bots`)]: data.series.done_bots[i] ?? 0,
              [t(`${K}.running_total`)]: data.series.total_running[i] ?? 0,
              [t(`${K}.resolved`)]: data.series.resolved_running[i] ?? 0,
            })),
          }
        : null,
    [data, bucketColumn, t]
  );
  useExportTable(exportTable);

  if (error && !data) return <TabError />;
  if (!data) return <TabLoading />;

  const { tiles, series, period } = data;
  const suffix = t(`${K}.vs_previous`, { days: period.days });
  const noneBefore = t(`${K}.none_before`, { days: period.days });
  const median = tiles.median_days_to_done;
  const medianChange =
    median.value !== null && median.previous !== null ? Math.round((median.value - median.previous) * 10) / 10 : null;

  const flow: TSeries[] = [
    { name: t(`${K}.done`), token: "chart-1", values: series.done },
    { name: t(`${K}.created`), token: "chart-3", values: series.created },
    ...(compare
      ? [
          {
            name: t(`${K}.previous`, { name: t(`${K}.done`) }),
            token: "chart-ref" as const,
            values: series.previous_done,
            style: "ref" as const,
          },
        ]
      : []),
  ];
  // the running totals: every item so far, and those done or cancelled by then (D47)
  const totals: TSeries[] = [
    { name: t(`${K}.resolved`), token: "chart-1", values: series.resolved_running },
    { name: t(`${K}.total`), token: "chart-3", values: series.total_running },
  ];
  const lines = running ? totals : flow;
  const bucketRows = (columns: Record<string, number[]>) =>
    labels.map((label, i) => ({
      key: period.buckets[i],
      cells: {
        bucket: label,
        ...Object.fromEntries(Object.entries(columns).map(([key, values]) => [key, values[i] ?? 0])),
      },
    }));

  return (
    <TabBody>
      <TileRow>
        <StatTile
          label={t(`${K}.created`)}
          value={formatNumber(tiles.created.value)}
          delta={percentDelta(tiles.created.value, tiles.created.previous, false, suffix)}
          note={tiles.created.previous ? undefined : noneBefore}
        />
        <StatTile
          label={t(`${K}.done`)}
          value={formatNumber(tiles.done.value)}
          delta={percentDelta(tiles.done.value, tiles.done.previous, true, suffix)}
          note={tiles.done.previous ? undefined : noneBefore}
          trend={series.done}
        />
        <StatTile
          label={t(`${K}.median_to_done`)}
          value={median.value === null ? t(`${K}.none`) : t(`${K}.days_value`, { value: median.value })}
          delta={
            medianChange
              ? {
                  text: t(`${K}.days_value`, { value: `${medianChange > 0 ? "+" : ""}${medianChange}` }),
                  up: medianChange > 0,
                  good: medianChange < 0,
                }
              : undefined
          }
        />
        <StatTile
          label={t(`${K}.open_now`)}
          value={formatNumber(tiles.open.value)}
          note={t(`${K}.across_projects`, { count: tiles.open.projects })}
        />
      </TileRow>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard
          title={t(running ? `${K}.total_and_resolved` : `${K}.created_and_done`)}
          sub={running ? undefined : per}
          actions={
            <Segmented
              label={t(`${K}.flow_view`)}
              options={[
                { value: "bucket", label: t(period.bucket === "day" ? `${K}.each_day` : `${K}.each_week`) },
                { value: "running", label: t(`${K}.running_total`) },
              ]}
              value={running ? "running" : "bucket"}
              onChange={(value) => update({ flow: value === "running" ? "running" : null })}
            />
          }
          table={
            running ? (
              <InsightsTable
                columns={[
                  { key: "bucket", label: bucketColumn, width: "minmax(0,1fr)" },
                  { key: "total", label: t(`${K}.total`), width: "90px", align: "right" },
                  { key: "resolved", label: t(`${K}.resolved`), width: "90px", align: "right", strong: true },
                  { key: "open", label: t(`${K}.open`), width: "90px", align: "right" },
                ]}
                rows={bucketRows({
                  total: series.total_running,
                  resolved: series.resolved_running,
                  open: series.total_running.map((total, i) => total - (series.resolved_running[i] ?? 0)),
                })}
              />
            ) : (
              <InsightsTable
                columns={[
                  { key: "bucket", label: bucketColumn, width: "minmax(0,1fr)" },
                  { key: "created", label: t(`${K}.created`), width: "90px", align: "right" },
                  { key: "done", label: t(`${K}.done`), width: "90px", align: "right", strong: true },
                ]}
                rows={bucketRows({ created: series.created, done: series.done })}
              />
            )
          }
        >
          <Legend series={lines.map((s) => ({ name: s.name, token: s.token, line: true }))} />
          <LineChart series={lines} labels={labels} />
        </ChartCard>
        <ChartCard
          title={t(`${K}.done_by`)}
          sub={per}
          table={
            <InsightsTable
              columns={[
                { key: "bucket", label: bucketColumn, width: "minmax(0,1fr)" },
                { key: "people", label: t(`${K}.people`), width: "90px", align: "right" },
                { key: "bots", label: t(`${K}.bots`), width: "90px", align: "right" },
                { key: "done", label: t(`${K}.total`), width: "90px", align: "right", strong: true },
              ]}
              rows={bucketRows({ people: series.done_people, bots: series.done_bots, done: series.done })}
            />
          }
        >
          <Legend
            series={[
              { name: t(`${K}.people`), token: "chart-1" },
              { name: t(`${K}.bots`), token: "chart-2" },
            ]}
          />
          <ColumnChart
            categories={labels}
            series={[
              { name: t(`${K}.people`), token: "chart-1", values: series.done_people },
              { name: t(`${K}.bots`), token: "chart-2", values: series.done_bots },
            ]}
            totalLabel={t(`${K}.total`)}
          />
        </ChartCard>
      </div>
      <ChartCard
        title={t(`${K}.by_project`)}
        sub={t(`${K}.all_time`)}
        table={
          <InsightsTable
            columns={[
              { key: "project", label: t(`${K}.project`), width: "minmax(0,1fr)" },
              { key: "done", label: t(`${K}.done`), width: "90px", align: "right" },
              { key: "open", label: t(`${K}.open`), width: "90px", align: "right" },
              { key: "total", label: t(`${K}.total`), width: "90px", align: "right", strong: true },
            ]}
            rows={data.projects.map((p) => ({
              key: p.id,
              cells: { project: p.name, done: p.done, open: p.open, total: p.done + p.open },
            }))}
          />
        }
      >
        <Legend
          series={[
            { name: t(`${K}.done`), token: "chart-1" },
            { name: t(`${K}.open`), token: "chart-ref" },
          ]}
        />
        <BarList
          series={[
            { name: t(`${K}.done`), token: "chart-1" },
            { name: t(`${K}.open`), token: "chart-ref" },
          ]}
          rows={data.projects.map((p) => ({
            key: p.id,
            label: (
              <>
                <ProjectBadge name={p.name} seed={p.id} logo={p.logo_props} />
                <span className="truncate">{p.name}</span>
              </>
            ),
            values: [p.done, p.open],
          }))}
        />
      </ChartCard>
    </TabBody>
  );
});
