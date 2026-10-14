/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TEpicBurnupPoint } from "@plane/types";
// local imports
import { shortDate } from "../parts";

const W = 420;
const H = 140;
const P = 24;

/** Scope and done over the last four weeks and today, with the pace carried on as a dashed line (r4-12). */
export function EpicBurnup(props: { points: TEpicBurnupPoint[] }) {
  const { points } = props;
  const { t } = useTranslation();
  const last = points[points.length - 1];
  // Nothing to draw before the epic has work items
  if (points.length < 2 || !last || last.scope === 0) return null;
  const first = points[0];
  const top = Math.max(4, Math.ceil((Math.max(...points.map((point) => point.scope)) * 1.15) / 4) * 4);
  const xs = (index: number) => P + (index * (W - 2 * P)) / (points.length - 1);
  const ys = (value: number) => H - P - (value * (H - 2 * P)) / top;
  const line = (key: "scope" | "done") =>
    points.map((point, index) => `${xs(index).toFixed(1)},${ys(point[key]).toFixed(1)}`).join(" ");
  // The pace: the average weekly gain, carried a little past today
  const weekly = (last.done - first.done) / (points.length - 1);
  const endX = W - 4;
  const share = (endX - xs(points.length - 1)) / (xs(1) - xs(0));
  const endY = ys(Math.min(top, last.done + weekly * share));
  const grid = [0, 1, 2, 3].map((step) => ys((top / 3) * step));
  // Under the point, unless that runs into the dates; then above it
  const doneLabelY = ys(last.done) + 16 > H - 18 ? ys(last.done) - 8 : ys(last.done) + 16;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t("epics.detail.burnup_aria", { scope: last.scope, done: last.done })}
      className="h-auto w-full max-w-[420px]"
    >
      {grid.map((y) => (
        <line key={y} x1={P} x2={W - P} y1={y} y2={y} strokeWidth={1} className="stroke-(--border-color-subtle)" />
      ))}
      <polyline points={line("scope")} fill="none" strokeWidth={2} className="stroke-(--border-strong-1)" />
      <polyline points={line("done")} fill="none" strokeWidth={2.4} className="stroke-(--bg-accent-primary)" />
      {weekly > 0 && (
        <polyline
          points={`${xs(points.length - 1).toFixed(1)},${ys(last.done).toFixed(1)} ${endX},${endY.toFixed(1)}`}
          fill="none"
          strokeWidth={2}
          strokeDasharray="4 4"
          className="stroke-(--bg-accent-primary) opacity-60"
        />
      )}
      <circle cx={xs(points.length - 1)} cy={ys(last.done)} r={4} className="fill-(--bg-accent-primary)" />
      {points.map((point, index) => (
        <text
          key={point.date}
          x={xs(index)}
          y={H - 6}
          textAnchor="middle"
          className="fill-(--txt-tertiary) text-[10px]"
        >
          {index === points.length - 1 ? t("epics.detail.today") : shortDate(point.date)}
        </text>
      ))}
      <text
        x={xs(points.length - 1) - 4}
        y={ys(last.scope) - 8}
        textAnchor="end"
        className="fill-(--txt-secondary) text-[10.5px]"
      >
        {t("epics.detail.scope_label", { count: last.scope })}
      </text>
      <text
        x={xs(points.length - 1) - 8}
        y={doneLabelY}
        textAnchor="end"
        className="fill-(--txt-accent-primary) text-[10.5px]"
      >
        {t("epics.detail.done_label", { count: last.done })}
      </text>
    </svg>
  );
}
