/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import { StateGroupIcon } from "../icons/state/state-group-icon";
import type { StateGroup } from "../icons/state/helper";

/** The group a lozenge shows: the five categories, plus Review, the second started state. */
export type StateLozengeKind = StateGroup | "review";

const KIND_CLASSES: Record<StateLozengeKind, string> = {
  backlog: "bg-loz-backlog-bg text-loz-backlog-fg",
  unstarted: "bg-loz-unstarted-bg text-loz-unstarted-fg",
  started: "bg-loz-started-bg text-loz-started-fg",
  review: "bg-loz-review-bg text-loz-review-fg",
  completed: "bg-loz-completed-bg text-loz-completed-fg",
  cancelled: "bg-loz-cancelled-bg text-loz-cancelled-fg",
};

export type StateLozengeProps = {
  kind: StateLozengeKind;
  /** The state or group name; shown in capitals. */
  children: React.ReactNode;
  className?: string;
};

/** The uppercase lozenge on a group header: the state icon and the name on the group's tint. */
export function StateLozenge({ kind, children, className }: StateLozengeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-md pr-[7px] pl-[5px] text-11 font-semibold tracking-[0.02em] whitespace-nowrap uppercase",
        KIND_CLASSES[kind],
        className
      )}
    >
      <StateGroupIcon
        stateGroup={kind === "review" ? "started" : kind}
        review={kind === "review"}
        size="sm"
        className="text-current"
      />
      {children}
    </span>
  );
}
