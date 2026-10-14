/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { PulseStateSvgProps } from "./pulse-state-svg";
import { PulseStateSvg } from "./pulse-state-svg";

export type CancelledGroupIconProps = PulseStateSvgProps;

/** Cancelled: a filled disc with a cross. */
export function CancelledGroupIcon({ className, ...rest }: CancelledGroupIconProps) {
  return (
    <PulseStateSvg className={cn("text-icon-states-cancelled", className)} {...rest}>
      <circle cx="7" cy="7" r="6" fill="currentColor" stroke="none" />
      <path d="m5 5 4 4M9 5l-4 4" style={{ stroke: "var(--bg-surface-1)" }} strokeWidth={1.6} strokeLinecap="round" />
    </PulseStateSvg>
  );
}
