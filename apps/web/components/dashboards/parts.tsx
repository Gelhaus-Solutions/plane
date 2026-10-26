/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import type { TChartToken } from "@/components/analytics/charts/charts";

export function Kbd(props: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary">
      {props.children}
    </kbd>
  );
}

type THeadButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  kbd?: string;
  primary?: boolean;
};

/** The frames' .btn: a bordered button with an icon, its label and the key that does the same */
export const HeadButton = forwardRef<HTMLButtonElement, THeadButtonProps>(function HeadButton(props, ref) {
  const { icon, kbd, primary, className, children, type = "button", ...rest } = props;
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:opacity-60 [&_svg]:size-3.5",
        primary
          ? "bg-accent-primary text-on-color hover:bg-accent-primary-hover"
          : "border border-strong bg-layer-1 text-primary shadow-e1 hover:bg-layer-1-hover [&_svg]:text-secondary",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
});

/** Series 1 to 3 on the chart tokens, Other on the reference grey */
export const tokenAt = (key: string, index: number): TChartToken =>
  key === "other" ? "chart-ref" : ((["chart-1", "chart-2", "chart-3"] as const)[index] ?? "chart-ref");

/** The frames' colours for fixed splits: done and open, people and bots */
const FIXED_TOKENS: Record<string, TChartToken> = {
  done: "chart-1",
  open: "chart-ref",
  cancelled: "chart-3",
  people: "chart-1",
  bots: "chart-2",
  resolved: "chart-1",
  total: "chart-3",
  created: "chart-3",
};

export const seriesToken = (key: string, index: number) => FIXED_TOKENS[key] ?? tokenAt(key, index);

/** A split's series: fixed colours for done and open or people and bots, the next free one for anything else */
export const splitToken = (split: string | undefined, key: string, index: number) =>
  !split || split === "status" || split === "assignee_type" ? seriesToken(key, index) : tokenAt(key, index);

const STATE_GROUP_KEYS = new Set(["backlog", "unstarted", "started", "review", "completed", "cancelled"]);
const PRIORITY_KEYS = new Set(["urgent", "high", "medium", "low", "none"]);
const SERIES_KEYS = new Set([
  "created",
  "done",
  "resolved",
  "total",
  "open",
  "cancelled",
  "people",
  "bots",
  "other",
  "none",
]);

/** The name of a series or a row: fixed keys in the viewer's language, the rest as the server named them */
export function useSeriesName() {
  const { t } = useTranslation();
  return useCallback(
    (field: string | undefined, key: string, name: string) => {
      if (key === "other") return t("dashboards.series.other");
      if (field === "state_group" && STATE_GROUP_KEYS.has(key)) return t(`dashboards.state_group.${key}`);
      if (field === "priority" && PRIORITY_KEYS.has(key)) return t(`dashboards.priority.${key}`);
      if (key === "none") return t(field === "assignee" ? "dashboards.series.unassigned" : "dashboards.series.none");
      if ((!field || field === "status" || field === "assignee_type") && SERIES_KEYS.has(key))
        return t(`dashboards.series.${key}`);
      return name || key;
    },
    [t]
  );
}

/** An element's size, kept current as it changes */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((current) =>
        Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
          ? current
          : { width: Math.floor(width), height: Math.floor(height) }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
