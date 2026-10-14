/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

/**
 * The analytics charts on the Pulse chart tokens (chart-1 to chart-3, chart-ref, chart-grid), drawn as the frames draw
 * them: 2 px lines with an end dot ringed in the surface colour, columns at most 24 px wide with a 4 px rounded top
 * and a 2 px gap between stacked parts, a 1 px grid, and a tooltip per x column on hover.
 */
export type TChartToken = "chart-1" | "chart-2" | "chart-3" | "chart-ref";

export type TSeries = { name: string; token: TChartToken; values: (number | null)[]; style?: "line" | "ref" };

const AXIS_TEXT = { fill: "var(--txt-tertiary)", fontSize: 10.5 };

export const formatNumber = (value: number, unit = "") =>
  `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;

const lastValue = (values: (number | null)[]) => {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null) return v;
  }
  return undefined;
};

/** The top of the axis: four grid steps of a round size, so every grid line falls on a whole, readable number */
export function niceMax(value: number) {
  const quarter = value / 4;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(quarter)));
  const step = [1, 2, 3, 4, 5, 6, 8, 10].find((m) => m * magnitude >= quarter) ?? 10;
  return 4 * step * magnitude;
}

function Grid(props: { ymax: number; y: (v: number) => number; left: number; right: number }) {
  const { ymax, y, left, right } = props;
  return (
    <>
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (ymax * k) / 4;
        return (
          <g key={k}>
            <line x1={left} x2={right} y1={y(v)} y2={y(v)} strokeWidth={1} style={{ stroke: "var(--chart-grid)" }} />
            <text x={left - 8} y={y(v) + 3.5} textAnchor="end" style={AXIS_TEXT}>
              {formatNumber(v)}
            </text>
          </g>
        );
      })}
    </>
  );
}

type TTipRow = { name: string; token?: TChartToken; value: string };

function Tip(props: { title: string; rows: TTipRow[]; flip: boolean }) {
  const { title, rows, flip } = props;
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1 z-[5] flex min-w-[120px] flex-col gap-[3px] rounded-[9px] bg-popover px-[9px] py-[7px] text-12 whitespace-nowrap opacity-0 shadow-e3 transition-opacity duration-[120ms] group-hover/col:opacity-100",
        flip ? "right-[calc(50%+10px)]" : "left-[calc(50%+10px)]"
      )}
    >
      <span className="font-semibold text-primary">{title}</span>
      {rows.map((row) => (
        <span key={row.name} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-secondary">
            {row.token && (
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: `var(--${row.token})` }} />
            )}
            {row.name}
          </span>
          <span className="flex-1" />
          <span className="font-semibold text-primary tabular-nums">{row.value}</span>
        </span>
      ))}
    </div>
  );
}

export function Legend(props: { series: { name: string; token: TChartToken; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-3.5">
      {props.series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5 text-12 text-secondary">
          <i
            className={cn("inline-block", s.line ? "h-0.5 w-3 rounded-[1px]" : "size-2.5 rounded-[3px]")}
            style={{ background: `var(--${s.token})` }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

type TLineChartProps = {
  series: TSeries[];
  labels: string[];
  /** Tooltip headings per x, when they differ from the axis labels */
  titles?: string[];
  width?: number;
  height?: number;
  unit?: string;
};

export function LineChart(props: TLineChartProps) {
  const { series, labels, titles, width: w = 560, height: h = 200, unit = "" } = props;
  const [left, right, top, bottom] = [34, 12, 10, 24];
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const ymax = niceMax(Math.max(1, ...all));
  const x = (i: number) => left + (n > 1 ? (i * (w - left - right)) / (n - 1) : (w - left - right) / 2);
  const y = (v: number) => top + (1 - v / ymax) * (h - top - bottom);
  // every step-th label, counted back from the last so the newest is always named
  const step = Math.max(1, Math.ceil(n / 8));
  const total = w + 40;
  const colWidth = n > 1 ? (w - left - right) / (n - 1) : w - left - right;
  // the last values are labelled unless two would collide
  const ends = series
    .filter((s) => s.style !== "ref")
    .map((s) => {
      const last = lastValue(s.values);
      return last === undefined ? null : y(last);
    })
    .filter((v): v is number => v !== null);
  const labelEnds = !ends.some((a, i) => ends.slice(i + 1).some((b) => Math.abs(a - b) < 13));

  return (
    <div className="relative" style={{ aspectRatio: `${total}/${h}` }}>
      <svg
        viewBox={`0 0 ${total} ${h}`}
        role="img"
        aria-label={`${series.map((s) => s.name).join(", ")}, ${labels[0] ?? ""} to ${labels[n - 1] ?? ""}`}
        className="block h-auto w-full overflow-visible"
      >
        <Grid ymax={ymax} y={y} left={left} right={w - right} />
        {labels.map((label, i) =>
          (n - 1 - i) % step === 0 ? (
            <text key={label} x={x(i)} y={h - 6} textAnchor="middle" style={AXIS_TEXT}>
              {label}
            </text>
          ) : null
        )}
        {series.map((s) => {
          const points = s.values
            .map((v, i) => (v === null ? null : ([x(i), y(v)] as const)))
            .filter((p): p is readonly [number, number] => p !== null);
          const last = points[points.length - 1];
          const endValue = lastValue(s.values);
          return (
            <g key={s.name}>
              <polyline
                points={points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}
                fill="none"
                strokeWidth={s.style === "ref" ? 1.5 : 2}
                strokeDasharray={s.style === "ref" ? "4 3" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: `var(--${s.token})` }}
              />
              {s.style !== "ref" && last && (
                <>
                  <circle
                    cx={last[0]}
                    cy={last[1]}
                    r={4}
                    strokeWidth={2}
                    style={{ fill: `var(--${s.token})`, stroke: "var(--bg-surface-1)" }}
                  />
                  {labelEnds && endValue !== undefined && (
                    <text x={last[0] + 8} y={last[1] + 4} style={{ fill: "var(--txt-secondary)", fontSize: 11 }}>
                      {formatNumber(endValue, unit)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
      {labels.map((label, i) => {
        const rows = series
          .map((s) => ({ name: s.name, token: s.token, v: s.values[i] }))
          .filter((r): r is { name: string; token: TChartToken; v: number } => r.v !== null && r.v !== undefined)
          .map((r) => ({ name: r.name, token: r.token, value: formatNumber(r.v, unit) }));
        if (!rows.length) return null;
        return (
          <div
            key={label}
            className="group/col absolute top-0"
            style={{
              left: `${((x(i) - colWidth / 2) / total) * 100}%`,
              width: `${(colWidth / total) * 100}%`,
              height: `${((h - bottom) / h) * 100}%`,
            }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px bg-(--border-strong-1) opacity-0 transition-opacity duration-[120ms] group-hover/col:opacity-100" />
            <Tip title={titles?.[i] ?? label} rows={rows} flip={i > n * 0.6} />
          </div>
        );
      })}
    </div>
  );
}

type TColumnChartProps = {
  categories: string[];
  /** Stable keys per column when names can repeat; the names otherwise */
  keys?: string[];
  series: { name: string; token: TChartToken; values: number[] }[];
  titles?: string[];
  width?: number;
  height?: number;
  unit?: string;
  /** Which columns carry their total on top */
  totals?: "all" | "last" | "none";
  /** The tooltip's sum row, when there are several series */
  totalLabel?: string;
};

/** Stacked columns */
export function ColumnChart(props: TColumnChartProps) {
  const { categories, keys = categories, series, titles, width: w = 560, height: h = 200 } = props;
  const { unit = "", totals = "last", totalLabel } = props;
  const [left, right, top, bottom] = [34, 8, 16, 24];
  const n = Math.max(1, categories.length);
  const sums = categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const ymax = niceMax(Math.max(1, ...sums));
  const slot = (w - left - right) / n;
  const bw = Math.min(24, slot * 0.55);
  const y = (v: number) => top + (1 - v / ymax) * (h - top - bottom);
  const step = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="relative" style={{ aspectRatio: `${w}/${h}` }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${series.map((s) => s.name).join(", ")} by ${categories[0] ?? ""} to ${categories[n - 1] ?? ""}`}
        className="block h-auto w-full overflow-visible"
      >
        <Grid ymax={ymax} y={y} left={left} right={w - right} />
        {keys.map((key, i) => {
          const category = categories[i];
          const cx = left + slot * (i + 0.5);
          const x0 = cx - bw / 2;
          const parts = series.map((s) => ({ s, v: s.values[i] ?? 0 })).filter((p) => p.v > 0);
          let base = 0;
          const showTotal = totals === "all" || (totals === "last" && i === n - 1);
          return (
            <g key={key}>
              {parts.map(({ s, v }, k) => {
                const y1 = y(base + v);
                const y0 = y(base);
                base += v;
                const gap = k > 0 ? 2 : 0;
                const hh = Math.max(0, y0 - y1 - gap);
                const yb = y0 - gap;
                const isTop = k === parts.length - 1;
                const r = Math.min(4, hh);
                const d = isTop
                  ? `M${x0},${yb} V${yb - hh + r} Q${x0},${yb - hh} ${x0 + r},${yb - hh} H${x0 + bw - r} Q${x0 + bw},${yb - hh} ${x0 + bw},${yb - hh + r} V${yb} Z`
                  : `M${x0},${yb} V${yb - hh} H${x0 + bw} V${yb} Z`;
                return <path key={s.name} d={d} style={{ fill: `var(--${s.token})` }} />;
              })}
              {showTotal && sums[i] > 0 && (
                <text
                  x={cx}
                  y={y(sums[i]) - 5}
                  textAnchor="middle"
                  style={{ fill: "var(--txt-secondary)", fontSize: 10.5 }}
                >
                  {formatNumber(sums[i], unit)}
                </text>
              )}
              {(n - 1 - i) % step === 0 && (
                <text x={cx} y={h - 6} textAnchor="middle" style={AXIS_TEXT}>
                  {category}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {keys.map((key, i) => {
        const category = categories[i];
        const rows: TTipRow[] = series.map((s) => ({
          name: s.name,
          token: s.token,
          value: formatNumber(s.values[i] ?? 0, unit),
        }));
        if (series.length > 1 && totalLabel) rows.push({ name: totalLabel, value: formatNumber(sums[i], unit) });
        const cx = left + slot * (i + 0.5);
        return (
          <div
            key={key}
            className="group/col absolute top-0"
            style={{
              left: `${((cx - slot / 2) / w) * 100}%`,
              width: `${(slot / w) * 100}%`,
              height: `${((h - bottom) / h) * 100}%`,
            }}
          >
            <Tip title={titles?.[i] ?? category} rows={rows} flip={i > n * 0.6} />
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal stacked bars with a label and the total per row */
export function BarList(props: {
  rows: { key: string; label: ReactNode; values: number[] }[];
  series: { name: string; token: TChartToken }[];
  unit?: string;
}) {
  const { rows, series, unit = "" } = props;
  const max = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const filled = row.values.filter((v) => v > 0).length;
        let seen = 0;
        return (
          <div
            key={row.key}
            className="grid h-7 grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px]"
          >
            <span className="flex min-w-0 items-center gap-[7px] truncate">{row.label}</span>
            <span className="flex h-3">
              {series.map((s, k) => {
                const v = row.values[k] ?? 0;
                if (v <= 0) return null;
                seen += 1;
                return (
                  <span
                    key={s.name}
                    title={`${s.name}: ${formatNumber(v, unit)}`}
                    className={cn("mr-0.5", seen === filled && "rounded-r-[4px]")}
                    style={{ width: `${(v / max) * 100}%`, background: `var(--${s.token})` }}
                  />
                );
              })}
            </span>
            <span className="text-right text-secondary tabular-nums">
              {formatNumber(
                row.values.reduce((a, b) => a + b, 0),
                unit
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline(props: { values: number[]; token?: TChartToken; width?: number; height?: number }) {
  const { values, token = "chart-1", width: w = 110, height: h = 28 } = props;
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => 2 + (i * (w - 6)) / (values.length - 1);
  const y = (v: number) => 3 + (1 - v / max) * (h - 6);
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible" style={{ width: w, height: h }}>
      <polyline
        points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ stroke: `var(--${token})` }}
      />
      <circle
        cx={x(last)}
        cy={y(values[last])}
        r={3.2}
        strokeWidth={2}
        style={{ fill: `var(--${token})`, stroke: "var(--bg-surface-2)" }}
      />
    </svg>
  );
}
