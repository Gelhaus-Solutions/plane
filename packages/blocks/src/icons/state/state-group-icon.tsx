/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import { BacklogGroupIcon } from "./backlog-group-icon";
import { CancelledGroupIcon } from "./cancelled-group-icon";
import { CompletedGroupIcon } from "./completed-group-icon";
import type { StateGroup, StateIconSize } from "./helper";
import { getStateIconSize } from "./helper";
import { StartedGroupIcon } from "./started-group-icon";
import { UnstartedGroupIcon } from "./unstarted-group-icon";

export type StateGroupIconProps = {
  className?: string;
  /** @deprecated State icons take their colour from the state group (Pulse); a state's own colour is ignored. */
  color?: string;
  /** How much of a started state's pie is filled, 0 to 100. */
  percentage?: number;
  /** The review state: a started state drawn three quarters filled in the second started colour. */
  review?: boolean;
  stateGroup: StateGroup;
  size?: StateIconSize;
};

/** @deprecated Use StateGroupIconProps instead. */
export type IStateGroupIcon = StateGroupIconProps;

export function StateGroupIcon({ className, percentage, review, stateGroup, size = "sm" }: StateGroupIconProps) {
  const iconSize = getStateIconSize(size);
  const sized = { width: iconSize, height: iconSize, className };
  switch (stateGroup) {
    case "backlog":
      return <BacklogGroupIcon {...sized} />;
    case "started":
      return <StartedGroupIcon {...sized} percentage={percentage} review={review} />;
    case "completed":
      return <CompletedGroupIcon {...sized} />;
    case "cancelled":
      return <CancelledGroupIcon {...sized} />;
    default:
      return <UnstartedGroupIcon {...sized} />;
  }
}
