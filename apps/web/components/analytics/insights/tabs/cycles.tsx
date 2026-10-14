/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { orderBy } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { ChartCard, InsightsTable, StatTile } from "../../charts/cards";
import { ColumnChart, formatNumber, Legend } from "../../charts/charts";
import { useExportTable } from "../export";
import type { TCycleRow, TCyclesInsights } from "../types";
import { useInsights } from "../use-insights";
import { dayLabel, TabBody, TabError, TabLoading, TileRow } from "./common";

const K = "workspace_analytics.insights";
// the chart shows the cycles that ended last; the table has them all
const CHARTED = 12;

const STATUS_CLASS: Record<TCycleRow["status"], string> = {
  current: "bg-loz-started-bg text-loz-started-fg",
  upcoming: "bg-loz-unstarted-bg text-loz-unstarted-fg",
  completed: "bg-loz-completed-bg text-loz-completed-fg",
};

const completion = (c: TCycleRow) => {
  const scope = c.total - c.cancelled;
  return scope > 0 ? Math.round((100 * c.done) / scope) : null;
};

/** Cycles: the cycles that overlap the period, how many items each held and how much of it got done */
export const CyclesTab = observer(function CyclesTab() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data, error } = useInsights<TCyclesInsights>(workspaceSlug?.toString() ?? "", "cycles");

  const exportTable = useMemo(
    () =>
      data
        ? {
            name: `analytics-cycles-${data.period.start}-${data.period.end}`,
            rows: data.cycles.map((c) => ({
              [t(`${K}.cycle`)]: c.name,
              [t(`${K}.project`)]: c.project.identifier,
              start: c.start_date,
              end: c.end_date,
              [t(`${K}.status`)]: t(`${K}.cycle_status.${c.status}`),
              [t(`${K}.items`)]: c.total,
              [t(`${K}.done`)]: c.done,
              [t(`${K}.completion_short`)]: completion(c) ?? "",
            })),
          }
        : null,
    [data, t]
  );
  useExportTable(exportTable);

  if (error && !data) return <TabError />;
  if (!data) return <TabLoading />;

  const { tiles } = data;
  const charted = data.cycles.slice(-CHARTED);

  return (
    <TabBody>
      <TileRow>
        <StatTile label={t(`${K}.cycles_in_period`)} value={formatNumber(tiles.cycles)} />
        <StatTile label={t(`${K}.active_now`)} value={formatNumber(tiles.current)} />
        <StatTile
          label={t(`${K}.completion`)}
          value={tiles.completion === null ? t(`${K}.none`) : `${tiles.completion}%`}
        />
        <StatTile label={t(`${K}.items_in_cycles`)} value={formatNumber(tiles.items)} />
      </TileRow>
      <ChartCard title={t(`${K}.done_per_cycle`)}>
        {charted.length ? (
          <>
            <Legend
              series={[
                { name: t(`${K}.done`), token: "chart-1" },
                { name: t(`${K}.not_done`), token: "chart-ref" },
              ]}
            />
            <ColumnChart
              categories={charted.map((c) => c.name)}
              keys={charted.map((c) => c.id)}
              titles={charted.map((c) => `${c.project.identifier} ${c.name}`)}
              series={[
                { name: t(`${K}.done`), token: "chart-1", values: charted.map((c) => c.done) },
                {
                  name: t(`${K}.not_done`),
                  token: "chart-ref",
                  values: charted.map((c) => c.total - c.done - c.cancelled),
                },
              ]}
              totals="all"
              totalLabel={t(`${K}.total`)}
              width={900}
              height={220}
            />
          </>
        ) : (
          <p className="py-6 text-center text-12 text-tertiary">{t(`${K}.no_cycles`)}</p>
        )}
      </ChartCard>
      <ChartCard title={t(`${K}.cycles_in_period`)} sub={t(`${K}.same_data`)}>
        <InsightsTable
          columns={[
            { key: "cycle", label: t(`${K}.cycle`), width: "minmax(0,1fr)" },
            { key: "project", label: t(`${K}.project`), width: "90px" },
            { key: "dates", label: t(`${K}.dates`), width: "140px" },
            { key: "status", label: t(`${K}.status`), width: "100px" },
            { key: "items", label: t(`${K}.items`), width: "80px", align: "right" },
            { key: "done", label: t(`${K}.done`), width: "80px", align: "right" },
            { key: "completion", label: t(`${K}.completion_short`), width: "100px", align: "right", strong: true },
          ]}
          rows={orderBy(data.cycles, "end_date", "desc").map((c) => ({
            key: c.id,
            cells: {
              cycle: <span className="truncate font-medium">{c.name}</span>,
              project: <span className="font-code text-11 text-secondary">{c.project.identifier}</span>,
              dates: (
                <span className="text-secondary">
                  {t(`${K}.range`, { from: dayLabel(c.start_date), to: dayLabel(c.end_date) })}
                </span>
              ),
              status: (
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-md px-1.5 text-11 font-semibold tracking-[0.02em] uppercase",
                    STATUS_CLASS[c.status]
                  )}
                >
                  {t(`${K}.cycle_status.${c.status}`)}
                </span>
              ),
              items: c.total,
              done: c.done,
              completion: completion(c) === null ? "" : `${completion(c)}%`,
            },
          }))}
          empty={t(`${K}.no_cycles`)}
        />
      </ChartCard>
    </TabBody>
  );
});
