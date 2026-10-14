/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { PulseStateSvgProps } from "./pulse-state-svg";
import { piePath, PulseStateSvg } from "./pulse-state-svg";

export type StartedGroupIconProps = PulseStateSvgProps & {
  /** How much of the pie is filled, 0 to 100 (or a fraction of 1 or less). Half by default; a second started state fills three quarters. */
  percentage?: number;
  /** The review state: three quarters filled, in the second started colour. */
  review?: boolean;
};

export const STARTED_DEFAULT_PERCENTAGE = 50;
export const REVIEW_PERCENTAGE = 75;

/** Started: a ring with a pie inside that fills as work progresses. */
export function StartedGroupIcon({ className, percentage, review = false, ...rest }: StartedGroupIconProps) {
  const raw = review ? REVIEW_PERCENTAGE : (percentage ?? STARTED_DEFAULT_PERCENTAGE);
  const fraction = raw <= 1 ? raw : raw / 100;
  return (
    <PulseStateSvg className={cn(review ? "text-state-started-2" : "text-icon-states-started", className)} {...rest}>
      <circle cx="7" cy="7" r="5.5" />
      <path d={piePath(fraction)} fill="currentColor" stroke="none" />
    </PulseStateSvg>
  );
}
