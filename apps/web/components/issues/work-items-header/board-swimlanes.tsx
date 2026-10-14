/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueGroupByOptions } from "@plane/types";
import { cn } from "@plane/utils";

const LANES: { key: TIssueGroupByOptions; label: string }[] = [
  { key: "assignees", label: "work_items_header.swimlane_assignee" },
  { key: "priority", label: "work_items_header.swimlane_priority" },
  { key: null, label: "work_items_header.swimlane_none" },
];

type Props = {
  groupBy: TIssueGroupByOptions | undefined;
  subGroupBy: TIssueGroupByOptions | undefined;
  onChange: (subGroupBy: TIssueGroupByOptions) => void;
};

/** The board's swimlanes (3A): what the rows split by, as a segmented control; a lane cannot repeat the columns */
export const BoardSwimlanes = observer(function BoardSwimlanes(props: Props) {
  const { groupBy, subGroupBy, onChange } = props;
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-12 text-secondary">{t("work_items_header.swimlanes")}</span>
      <div role="group" className="inline-flex items-center gap-0.5 rounded-lg bg-layer-2 p-0.5 text-12">
        {LANES.map((lane) => {
          const active = (subGroupBy ?? null) === lane.key;
          return (
            <button
              key={lane.key ?? "none"}
              type="button"
              aria-pressed={active}
              disabled={lane.key !== null && lane.key === groupBy}
              onClick={() => !active && onChange(lane.key)}
              className={cn(
                "flex h-6 items-center rounded-md px-2.5 text-secondary transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-not-allowed disabled:opacity-50",
                { "ring-border-strong bg-surface-1 font-semibold text-primary shadow-e1 ring-1": active }
              )}
            >
              {t(lane.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
});
