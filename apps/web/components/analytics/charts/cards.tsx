/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDownOutline, ChevronUpOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import type { TChartToken } from "./charts";
import { Sparkline } from "./charts";

type TSegmentedProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

/** A segmented control (the frames' seg): the picked option raised on the surface */
export function Segmented<T extends string>(props: TSegmentedProps<T>) {
  const { options, value, onChange, label, className } = props;
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-layer-2 p-0.5 text-12", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => option.value !== value && onChange(option.value)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-md px-[9px] text-secondary transition-colors duration-[120ms] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong",
            {
              "bg-surface-1 font-semibold text-primary shadow-e1 ring-1 ring-(--border-strong)": option.value === value,
            }
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type TChartCardProps = {
  title: string;
  sub?: string;
  /** The same numbers as a table; with it the card offers Chart and Table */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A titled chart on the surface, switchable to its table */
export function ChartCard(props: TChartCardProps) {
  const { title, sub, table, children, className } = props;
  const { t } = useTranslation();
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section
      aria-label={title}
      className={cn("flex min-w-0 flex-col rounded-xl border border-strong bg-surface-1 shadow-e1", className)}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
        <span className="text-13 font-semibold text-primary">{title}</span>
        {sub && <span className="text-12 text-tertiary">{sub}</span>}
        <span className="flex-1" />
        {table && (
          <Segmented
            label={t("workspace_analytics.insights.view")}
            options={[
              { value: "chart", label: t("workspace_analytics.insights.chart") },
              { value: "table", label: t("workspace_analytics.insights.table") },
            ]}
            value={view}
            onChange={setView}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 px-3.5 pt-2 pb-3.5">
        {view === "table" && table ? table : children}
      </div>
    </section>
  );
}

type TStatTileProps = {
  label: string;
  value: string;
  /** A change against the previous period; good picks green or red, without it the change reads neutral */
  delta?: { text: string; up: boolean; good?: boolean };
  /** A quiet line instead of a change */
  note?: string;
  trend?: number[];
  trendToken?: TChartToken;
};

export function StatTile(props: TStatTileProps) {
  const { label, value, delta, note, trend, trendToken } = props;
  const Arrow = delta?.up ? ChevronUpOutline : ChevronDownOutline;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-strong bg-surface-2 px-3.5 py-3">
      <span className="text-12 text-secondary">{label}</span>
      <span className="text-[24px] font-semibold tracking-[-0.02em] text-primary">{value}</span>
      {delta ? (
        <span
          className={cn(
            "flex items-center gap-1 text-[11.5px]",
            delta.good === undefined ? "text-tertiary" : delta.good ? "text-success-primary" : "text-danger-primary"
          )}
        >
          <Arrow className="size-[11px]" aria-hidden="true" />
          {delta.text}
        </span>
      ) : (
        note && <span className="text-[11.5px] text-tertiary">{note}</span>
      )}
      {trend && trend.length > 1 && (
        <div className="mt-1">
          <Sparkline values={trend} token={trendToken} />
        </div>
      )}
    </div>
  );
}

export type TTableColumn = { key: string; label: string; width: string; align?: "right"; strong?: boolean };

/** The frames' data table: a header on surface-2, 32 px rows, cells split by subtle rules */
export function InsightsTable(props: {
  columns: TTableColumn[];
  rows: { key: string; cells: Record<string, ReactNode> }[];
  empty?: string;
}) {
  const { columns, rows, empty } = props;
  const template = columns.map((c) => c.width).join(" ");
  const cell = "flex h-full min-w-0 items-center gap-1.5 truncate border-r border-subtle px-2.5 last:border-r-0";
  return (
    <div className="overflow-hidden rounded-[10px] border border-strong" role="table">
      <div
        role="row"
        className="grid h-[30px] items-center border-b border-subtle bg-surface-2 text-[11.5px] font-medium text-secondary"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className={cn(cell, c.align === "right" && "justify-end")}>
            {c.label}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          role="row"
          className="grid h-8 items-center border-b border-subtle text-[12.5px] text-primary last:border-b-0"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              role="cell"
              className={cn(cell, c.align === "right" && "justify-end tabular-nums", c.strong && "font-semibold")}
            >
              {row.cells[c.key]}
            </span>
          ))}
        </div>
      ))}
      {!rows.length && empty && <p className="px-2.5 py-4 text-center text-12 text-tertiary">{empty}</p>}
    </div>
  );
}

/** The change from the previous period as a tile delta: a percentage when there was something to compare with */
export function percentDelta(
  value: number,
  previous: number,
  higherIsGood: boolean | undefined,
  suffix: string
): TStatTileProps["delta"] {
  if (!previous || value === previous) return undefined;
  const pct = Math.round(((value - previous) / previous) * 100);
  const up = value > previous;
  return {
    text: `${up ? "+" : ""}${pct}% ${suffix}`,
    up,
    good: higherIsGood === undefined ? undefined : up === higherIsGood,
  };
}
