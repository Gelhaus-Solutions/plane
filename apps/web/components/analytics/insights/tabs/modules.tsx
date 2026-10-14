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
import { MODULE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { ChartCard, InsightsTable, StatTile } from "../../charts/cards";
import { BarList, formatNumber, Legend } from "../../charts/charts";
import { useExportTable } from "../export";
import type { TModuleRow, TModulesInsights } from "../types";
import { useInsights } from "../use-insights";
import { dayLabel, TabBody, TabError, TabLoading, TileRow } from "./common";

const K = "workspace_analytics.insights";
// the chart shows the largest modules; the table has them all
const CHARTED = 12;

const progress = (m: TModuleRow) => (m.total > 0 ? Math.round((100 * m.done) / m.total) : null);

/** Modules: every module in the projects, its open and done items, its target and what got done in the period */
export const ModulesTab = observer(function ModulesTab() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data, error } = useInsights<TModulesInsights>(workspaceSlug?.toString() ?? "", "modules");
  const statusLabel = (status: string) => {
    const known = MODULE_STATUS.find((s) => s.value === status);
    return known ? t(known.i18n_label) : status;
  };

  const exportTable = useMemo(
    () =>
      data
        ? {
            name: `analytics-modules-${data.period.start}-${data.period.end}`,
            rows: data.modules.map((m) => ({
              [t(`${K}.module`)]: m.name,
              [t(`${K}.project`)]: m.project.identifier,
              [t(`${K}.status`)]: m.status,
              [t(`${K}.lead`)]: m.lead?.name ?? "",
              [t(`${K}.target`)]: m.target_date ?? "",
              [t(`${K}.items`)]: m.total,
              [t(`${K}.done`)]: m.done,
              [t(`${K}.done_in_period`)]: m.done_in_period,
            })),
          }
        : null,
    [data, t]
  );
  useExportTable(exportTable);

  if (error && !data) return <TabError />;
  if (!data) return <TabLoading />;

  const { tiles } = data;
  const charted = orderBy(data.modules, "total", "desc").slice(0, CHARTED);

  return (
    <TabBody>
      <TileRow>
        <StatTile label={t(`${K}.modules_count`)} value={formatNumber(tiles.modules)} />
        <StatTile label={t(`${K}.in_progress`)} value={formatNumber(tiles.in_progress)} />
        <StatTile label={t(`${K}.overdue`)} value={formatNumber(tiles.overdue)} />
        <StatTile label={t(`${K}.done_in_period`)} value={formatNumber(tiles.done_in_period)} />
      </TileRow>
      <ChartCard title={t(`${K}.by_module`)}>
        {charted.length ? (
          <>
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
              rows={charted.map((m) => ({
                key: m.id,
                label: (
                  <>
                    <span className="shrink-0 font-code text-11 text-tertiary">{m.project.identifier}</span>
                    <span className="truncate">{m.name}</span>
                  </>
                ),
                values: [m.done, m.open],
              }))}
            />
          </>
        ) : (
          <p className="py-6 text-center text-12 text-tertiary">{t(`${K}.no_modules`)}</p>
        )}
      </ChartCard>
      <ChartCard title={t(`${K}.modules_count`)} sub={t(`${K}.same_data`)}>
        <InsightsTable
          columns={[
            { key: "module", label: t(`${K}.module`), width: "minmax(0,1fr)" },
            { key: "project", label: t(`${K}.project`), width: "90px" },
            { key: "status", label: t(`${K}.status`), width: "110px" },
            { key: "lead", label: t(`${K}.lead`), width: "130px" },
            { key: "target", label: t(`${K}.target`), width: "90px" },
            { key: "items", label: t(`${K}.items`), width: "70px", align: "right" },
            { key: "progress", label: t(`${K}.progress`), width: "130px" },
          ]}
          rows={data.modules.map((m) => {
            const pct = progress(m);
            return {
              key: m.id,
              cells: {
                module: <span className="truncate font-medium">{m.name}</span>,
                project: <span className="font-code text-11 text-secondary">{m.project.identifier}</span>,
                status: <span className="text-secondary">{statusLabel(m.status)}</span>,
                lead: <span className="truncate text-secondary">{m.lead?.name ?? ""}</span>,
                target: (
                  <span className={cn("text-secondary", m.overdue && "text-danger-primary")}>
                    {m.target_date ? dayLabel(m.target_date) : ""}
                  </span>
                ),
                items: m.total,
                progress:
                  pct === null ? (
                    ""
                  ) : (
                    <span className="flex w-full items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-layer-3">
                        <span className="block h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-8 text-right text-secondary tabular-nums">{pct}%</span>
                    </span>
                  ),
              },
            };
          })}
          empty={t(`${K}.no_modules`)}
        />
      </ChartCard>
    </TabBody>
  );
});
