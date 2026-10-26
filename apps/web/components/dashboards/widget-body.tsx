/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Link } from "react-router";
import { ChevronDownOutline, ChevronUpOutline } from "@makeplane/propel/icons";
import { StateGroupIcon } from "@plane/blocks/icons";
import { useTranslation } from "@plane/i18n";
import type { TStateGroups } from "@plane/types";
import { calculateTimeAgoShort, cn, renderFormattedDate } from "@plane/utils";
// components
import { InsightsTable } from "@/components/analytics/charts/cards";
import { BarList, ColumnChart, formatNumber, Legend, LineChart, Sparkline } from "@/components/analytics/charts/charts";
import type { TSeries } from "@/components/analytics/charts/charts";
import { dayLabel } from "@/components/analytics/insights/tabs/common";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// local imports
import { splitToken, useElementSize, useSeriesName } from "./parts";
import type { TDashboardWidget, TSeriesData, TWidgetData, TWidgetItem } from "./types";

type Props = {
  workspaceSlug: string;
  widget: Pick<TDashboardWidget, "chart" | "config">;
  data: TWidgetData;
};

/** What a widget draws from its numbers (r5-21): a number, a line, stacked bars, bars by row, a list or a table */
export function WidgetBody(props: Props) {
  const { widget, data } = props;
  const { t } = useTranslation();
  if (data.error) {
    return (
      <p role="alert" className="text-12 text-danger-primary">
        {data.error.source === "dashboard"
          ? t("dashboards.widget.dashboard_query_error")
          : t("dashboards.widget.query_error")}
        <span className="mt-1 block font-code text-11 text-secondary">{data.error.message}</span>
      </p>
    );
  }
  switch (widget.chart) {
    case "number":
      return <NumberBody {...props} />;
    case "line":
    case "bars":
      return <TimeBody {...props} />;
    case "rows":
    case "table":
      return <RowsBody {...props} />;
    case "list":
      return <ListBody {...props} />;
  }
}

function NumberBody(props: Props) {
  const { widget, data } = props;
  const { t } = useTranslation();
  const value = data.value ?? 0;
  const measure = widget.config.measure;
  const previous = data.previous;
  const change = previous === null || previous === undefined ? null : value - previous;
  // more done or resolved is good; more created is neither
  const good = measure === "created" || change === 0 || change === null ? undefined : change > 0;
  const Arrow = change !== null && change > 0 ? ChevronUpOutline : ChevronDownOutline;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-primary tabular-nums">
        {formatNumber(value)}
      </span>
      {change !== null && (
        <span
          className={cn(
            "flex items-center gap-1 text-[11.5px]",
            good === undefined ? "text-tertiary" : good ? "text-success-primary" : "text-danger-primary"
          )}
        >
          {change !== 0 && <Arrow className="size-[11px]" aria-hidden="true" />}
          {change === 0
            ? t("dashboards.widget.same_as_before")
            : t("dashboards.widget.vs_before", { delta: `${change > 0 ? "+" : ""}${change}` })}
        </span>
      )}
      {data.trend && data.trend.length > 1 && (
        <div className="mt-1">
          <Sparkline values={data.trend} />
        </div>
      )}
    </div>
  );
}

function TimeBody(props: Props) {
  const { widget, data } = props;
  const { t } = useTranslation();
  const name = useSeriesName();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const period = data.period;
  const raw = (data.series ?? []) as TSeriesData[];
  const split = widget.config.split_by || undefined;
  const labels = (period?.buckets ?? []).map(dayLabel);

  const series: TSeries[] = raw.map((s, i) => {
    return {
      name: split ? name(split, s.key, s.name) : t(`dashboards.series.${s.key}`),
      token: splitToken(split, s.key, i),
      values: s.values,
    };
  });
  const legend = widget.config.legend !== false && series.length > 0 && (
    <Legend series={series.map((s) => ({ name: s.name, token: s.token, line: widget.chart === "line" }))} />
  );
  const chartHeight = Math.max(80, height);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {legend}
      <div ref={ref} className="min-h-0 flex-1">
        {width > 0 &&
          (widget.chart === "line" ? (
            <LineChart series={series} labels={labels} width={Math.max(120, width - 40)} height={chartHeight} />
          ) : (
            <ColumnChart
              categories={labels}
              keys={period?.buckets}
              series={series.map((s) => ({ name: s.name, token: s.token, values: s.values.map((v) => v ?? 0) }))}
              width={width}
              height={chartHeight}
              totals={widget.config.totals ? "all" : "last"}
              totalLabel={t("dashboards.series.total")}
            />
          ))}
      </div>
    </div>
  );
}

function RowsBody(props: Props) {
  const { widget, data } = props;
  const { t } = useTranslation();
  const name = useSeriesName();
  const rowsBy = widget.config.x_axis;
  const split = widget.config.split_by || undefined;
  const rawSeries = (data.series ?? []) as { key: string; name: string }[];
  const series = rawSeries.map((s, i) => ({
    key: s.key,
    name: split ? name(split, s.key, s.name) : t("dashboards.series.items"),
    token: splitToken(split, s.key, i),
  }));
  const rows = data.rows ?? [];
  if (!rows.length) return <Empty />;

  if (widget.chart === "table") {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <InsightsTable
          columns={[
            { key: "name", label: t(`dashboards.field.${rowsBy ?? "project"}`), width: "minmax(120px,1fr)" },
            ...series.map((s) => ({ key: `s:${s.key}`, label: s.name, width: "84px", align: "right" as const })),
            ...(series.length > 1
              ? [
                  {
                    key: "total",
                    label: t("dashboards.series.total"),
                    width: "72px",
                    align: "right" as const,
                    strong: true,
                  },
                ]
              : []),
          ]}
          rows={rows.map((row) => ({
            key: row.key,
            cells: {
              name: name(rowsBy, row.key, row.name),
              total: row.total,
              ...Object.fromEntries(series.map((s, i) => [`s:${s.key}`, row.values[i] ?? 0])),
            },
          }))}
        />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {widget.config.legend !== false && series.length > 1 && <Legend series={series} />}
      <div className="min-h-0 flex-1 overflow-auto">
        <BarList
          series={series}
          rows={rows.map((row) => ({
            key: row.key,
            label: <span className="truncate">{name(rowsBy, row.key, row.name)}</span>,
            values: row.values,
          }))}
        />
      </div>
    </div>
  );
}

const ListBody = observer(function ListBody(props: Props) {
  const { workspaceSlug, widget, data } = props;
  const items = data.items ?? [];
  if (!items.length) return <Empty />;
  return (
    <div className="-mx-3.5 min-h-0 flex-1 overflow-auto">
      {items.map((item) => (
        <ListRow key={item.id} workspaceSlug={workspaceSlug} item={item} sort={widget.config.sort} />
      ))}
    </div>
  );
});

function ListRow(props: { workspaceSlug: string; item: TWidgetItem; sort: TDashboardWidget["config"]["sort"] }) {
  const { workspaceSlug, item, sort } = props;
  const { t } = useTranslation();
  let aside = t("dashboards.widget.ago", { time: calculateTimeAgoShort(item.created_at) });
  if (sort === "updated") aside = t("dashboards.widget.ago", { time: calculateTimeAgoShort(item.updated_at) });
  if (sort === "due") aside = item.target_date ? (renderFormattedDate(item.target_date, "MMM d") ?? "") : "";
  if (sort === "priority") aside = t(`dashboards.priority.${item.priority}`);
  return (
    <Link
      to={`/${workspaceSlug}/browse/${item.key}/`}
      className="grid h-10 grid-cols-[16px_72px_minmax(0,1fr)_auto_20px] items-center gap-2 border-b border-subtle px-3.5 text-[12.5px] last:border-b-0 hover:bg-layer-1-hover"
    >
      <StateGroupIcon stateGroup={item.state.group as TStateGroups} color={item.state.color} className="size-3.5" />
      <span className="truncate font-code text-[11.5px] text-secondary">{item.key}</span>
      <span className="truncate font-medium text-primary" title={item.name}>
        {item.name}
      </span>
      <span className="text-12 whitespace-nowrap text-secondary tabular-nums">{aside}</span>
      <span className="flex justify-end">
        {item.assignee_ids.length > 0 && <ButtonAvatars showTooltip userIds={item.assignee_ids.slice(0, 1)} />}
      </span>
    </Link>
  );
}

function Empty() {
  const { t } = useTranslation();
  return <p className="py-3 text-12 text-tertiary">{t("dashboards.widget.nothing")}</p>;
}
