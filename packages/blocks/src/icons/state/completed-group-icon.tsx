/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { PulseStateSvgProps } from "./pulse-state-svg";
import { PulseStateSvg } from "./pulse-state-svg";

export type CompletedGroupIconProps = PulseStateSvgProps;

/** Completed: a filled disc with a check. */
export function CompletedGroupIcon({ className, ...rest }: CompletedGroupIconProps) {
  return (
    <PulseStateSvg className={cn("text-icon-states-completed", className)} {...rest}>
      <circle cx="7" cy="7" r="6" fill="currentColor" stroke="none" />
      <path d="M4.6 7.1 6.3 8.8 9.4 5.5" style={{ stroke: "var(--bg-surface-1)" }} strokeWidth={1.6} />
    </PulseStateSvg>
  );
}
