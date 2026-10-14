/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { PulseStateSvgProps } from "./pulse-state-svg";
import { PulseStateSvg } from "./pulse-state-svg";

export type BacklogGroupIconProps = PulseStateSvgProps;

/** Backlog: a dashed ring. */
export function BacklogGroupIcon({ className, ...rest }: BacklogGroupIconProps) {
  return (
    <PulseStateSvg className={cn("text-icon-states-backlog", className)} {...rest}>
      <circle cx="7" cy="7" r="5.5" strokeDasharray="1.7 1.8" />
    </PulseStateSvg>
  );
}
