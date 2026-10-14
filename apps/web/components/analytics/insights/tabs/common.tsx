/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { format } from "date-fns";
import { useTranslation } from "@plane/i18n";
import { cn, getDate } from "@plane/utils";
// local imports
import type { TChartToken } from "../../charts/charts";
import type { TInsightsPeriod } from "../types";

/** Series colours in order, for splits and members */
export const TOKENS: TChartToken[] = ["chart-1", "chart-2", "chart-3", "chart-ref"];

export const dayLabel = (iso: string) => {
  const date = getDate(iso);
  return date ? format(date, "MMM d") : iso;
};

/** The x labels of a period's buckets, and the words for them */
export function usePeriodWords(period: TInsightsPeriod | undefined) {
  const { t } = useTranslation();
  return {
    labels: (period?.buckets ?? []).map(dayLabel),
    per: t(period?.bucket === "day" ? "workspace_analytics.insights.per_day" : "workspace_analytics.insights.per_week"),
    bucketColumn: t(
      period?.bucket === "day" ? "workspace_analytics.insights.day" : "workspace_analytics.insights.week"
    ),
  };
}

/** A tab's scrolling body */
export function TabBody(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-[18px] pt-4 pb-6", props.className)}>
      {props.children}
    </div>
  );
}

export function TileRow(props: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{props.children}</div>;
}

/** Grey boxes in the tab's shape while the first answer loads */
export function TabLoading() {
  return (
    <TabBody>
      <TileRow>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-[10px] bg-layer-2" />
        ))}
      </TileRow>
      <div className="h-72 animate-pulse rounded-xl bg-layer-2" />
    </TabBody>
  );
}

export function TabError() {
  const { t } = useTranslation();
  return (
    <TabBody>
      <p role="alert" className="text-13 text-danger-primary">
        {t("workspace_analytics.insights.error")}
      </p>
    </TabBody>
  );
}
