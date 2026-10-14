/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

export type IssuePriority = "urgent" | "high" | "medium" | "low" | "none";

/** @deprecated Use IssuePriority instead. */
export type TIssuePriorities = IssuePriority;

export type PriorityIconProps = {
  className?: string;
  priority: IssuePriority | undefined | null;
};

/** @deprecated Use PriorityIconProps instead. */
export type IPriorityIcon = PriorityIconProps;

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  urgent: "text-priority-urgent",
  high: "text-priority-high",
  medium: "text-priority-medium",
  low: "text-priority-low",
  none: "text-priority-none",
};

// How many of the three bars are lit; urgent is its own glyph
const LIT_BARS: Record<Exclude<IssuePriority, "urgent">, number> = { none: 0, low: 1, medium: 2, high: 3 };
const BARS = [
  { x: 1.5, y: 8, height: 4.5 },
  { x: 5.7, y: 5, height: 7.5 },
  { x: 9.9, y: 2, height: 10.5 },
];

/** Priority in the Pulse design: three bars (one, two or three lit), and urgent as an orange square. */
export function PriorityIcon(props: PriorityIconProps) {
  const { priority, className = "size-3.5" } = props;
  const level = priority ?? "none";

  return (
    <svg
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0", PRIORITY_COLOR[level], className)}
    >
      {level === "urgent" ? (
        <>
          <rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="currentColor" />
          <path
            d="M7 4.2v3.4M7 9.6v.2"
            fill="none"
            stroke="var(--bg-surface-1)"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </>
      ) : (
        BARS.map((bar, index) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width="2.6"
            height={bar.height}
            rx=".8"
            fill="currentColor"
            opacity={index < LIT_BARS[level] ? 1 : 0.28}
          />
        ))
      )}
    </svg>
  );
}
