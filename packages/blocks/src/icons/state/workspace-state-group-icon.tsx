/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { StateGroup, StateIconSize } from "./helper";
import { getStateIconSize } from "./helper";
import { PulseStateSvg } from "./pulse-state-svg";
import { StateGroupIcon } from "./state-group-icon";

export type WorkspaceStateGroupIconProps = {
  /** A workspace state group, or what of one the icon needs. */
  group: { key?: string | null; category: StateGroup; color?: string; is_builtin?: boolean } | null | undefined;
  className?: string;
  size?: StateIconSize;
};

/**
 * A workspace state group (E30): a built-in one as its category's icon (Review three quarters filled), a custom one
 * as a ring with a bar in its own colour.
 */
export function WorkspaceStateGroupIcon({ group, className, size = "sm" }: WorkspaceStateGroupIconProps) {
  if (!group) return <StateGroupIcon stateGroup="backlog" className={className} size={size} />;
  if (group.is_builtin)
    return (
      <StateGroupIcon stateGroup={group.category} review={group.key === "review"} className={className} size={size} />
    );
  const iconSize = getStateIconSize(size);
  return (
    <PulseStateSvg
      width={iconSize}
      height={iconSize}
      className={cn("text-secondary", className)}
      style={group.color ? { color: group.color } : undefined}
    >
      <circle cx="7" cy="7" r="5.5" />
      <path d="M4.75 7h4.5" />
    </PulseStateSvg>
  );
}
