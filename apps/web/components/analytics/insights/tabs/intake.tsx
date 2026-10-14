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
// local imports
import { ChartCard, InsightsTable, percentDelta, StatTile } from "../../charts/cards";
import type { TChartToken } from "../../charts/charts";
import { BarList, ColumnChart, formatNumber, Legend } from "../../charts/charts";
import { useExportTable } from "../export";
import type { TIntakeInsights } from "../types";
import { useInsights } from "../use-insights";
import { TabBody, TabError, TabLoading, TileRow, usePeriodWords } from "./common";

const K = "workspace_analytics.insights";

const OUTCOMES: { key: keyof TIntakeInsights["series"]; label: string; token: TChartToken }[] = [
  { key: "accepted", label: `${K}.accepted`, token: "chart-1" },
  { key: "pending", label: `${K}.pending`, token: "chart-2" },
  { key: "declined", label: `${K}.declined`, token: "chart-3" },
  { key: "duplicate", label: `${K}.duplicate`, token: "chart-ref" },
];

const SOURCE_LABEL: Record<string, string> = {
  IN_APP: `${K}.sources.in_app`,
  EMAIL: `${K}.sources.email`,
  API: `${K}.sources.api`,
};

/** Intake: what came in per bucket and how it was triaged, the queue still waiting, and where it came from */
export const IntakeTab = observer(function IntakeTab() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data, error } = useInsights<TIntakeInsights>(workspaceSlug?.toString() ?? "", "intake");
  const { labels, per, bucketColumn } = usePeriodWords(data?.period);

  const exportTable = useMemo(
    () =>
      data
        ? {
            name: `analytics-intake-${data.period.start}-${data.period.end}`,
            rows: data.period.buckets.map((bucket, i) => ({
              [bucketColumn]: bucket,
              ...Object.fromEntries(OUTCOMES.map((o) => [t(o.label), data.series[o.key][i] ?? 0])),
            })),
          }
        : null,
    [data, bucketColumn, t]
  );
  useExportTable(exportTable);

  if (error && !data) return <TabError />;
  if (!data) return <TabLoading />;

  const { tiles, period } = data;
  const received = tiles.received;
  const series = OUTCOMES.map((o) => ({ name: t(o.label), token: o.token, values: data.series[o.key] }));
  const empty = received.value === 0;

  return (
    <TabBody>
      <TileRow>
        <StatTile
          label={t(`${K}.received`)}
          value={formatNumber(received.value)}
          delta={percentDelta(
            received.value,
            received.previous,
            undefined,
            t(`${K}.vs_previous`, { days: period.days })
          )}
          note={received.previous ? undefined : t(`${K}.none_before`, { days: period.days })}
        />
        <StatTile label={t(`${K}.accepted`)} value={formatNumber(tiles.accepted)} />
        <StatTile label={t(`${K}.declined`)} value={formatNumber(tiles.declined)} />
        <StatTile label={t(`${K}.pending_now`)} value={formatNumber(tiles.pending)} />
      </TileRow>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title={t(`${K}.received_by_outcome`)}
          sub={per}
          table={
            <InsightsTable
              columns={[
                { key: "bucket", label: bucketColumn, width: "minmax(0,1fr)" },
                ...OUTCOMES.map((o) => ({ key: o.key, label: t(o.label), width: "90px", align: "right" as const })),
              ]}
              rows={labels.map((label, i) => ({
                key: period.buckets[i],
                cells: {
                  bucket: label,
                  ...Object.fromEntries(OUTCOMES.map((o) => [o.key, data.series[o.key][i] ?? 0])),
                },
              }))}
            />
          }
        >
          {empty ? (
            <p className="py-6 text-center text-12 text-tertiary">{t(`${K}.no_intake`)}</p>
          ) : (
            <>
              <Legend series={series.map((s) => ({ name: s.name, token: s.token }))} />
              <ColumnChart categories={labels} series={series} totalLabel={t(`${K}.total`)} />
            </>
          )}
        </ChartCard>
        <ChartCard title={t(`${K}.by_source`)}>
          {data.sources.length ? (
            <BarList
              series={[{ name: t(`${K}.received`), token: "chart-1" }]}
              rows={data.sources.map((s) => ({
                key: s.source,
                label: (
                  <span className="truncate">{SOURCE_LABEL[s.source] ? t(SOURCE_LABEL[s.source]) : s.source}</span>
                ),
                values: [s.count],
              }))}
            />
          ) : (
            <p className="py-6 text-center text-12 text-tertiary">{t(`${K}.no_intake`)}</p>
          )}
        </ChartCard>
      </div>
    </TabBody>
  );
});
