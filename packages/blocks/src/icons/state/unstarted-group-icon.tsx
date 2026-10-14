/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { PulseStateSvgProps } from "./pulse-state-svg";
import { PulseStateSvg } from "./pulse-state-svg";

export type UnstartedGroupIconProps = PulseStateSvgProps & {
  /** @deprecated Unstarted is always an empty ring. */
  percentage?: number;
};

/** Unstarted: an empty ring. */
export function UnstartedGroupIcon({ className, percentage: _percentage, ...rest }: UnstartedGroupIconProps) {
  return (
    <PulseStateSvg className={cn("text-icon-states-unstarted", className)} {...rest}>
      <circle cx="7" cy="7" r="5.5" />
    </PulseStateSvg>
  );
}
