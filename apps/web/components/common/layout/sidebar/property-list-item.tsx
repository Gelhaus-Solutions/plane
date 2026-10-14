/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type TSidebarPropertyListItemProps = {
  label: string;
  children: ReactNode;
  appendElement?: ReactNode;
  childrenClassName?: string;
  /** The peek's narrower label column (78 px instead of 96 px). */
  compact?: boolean;
};

/** One property row of the detail rail and the peek (4A, 5A): the label column, then the value control. */
export function SidebarPropertyListItem(props: TSidebarPropertyListItemProps) {
  const { label, children, appendElement, childrenClassName, compact = false } = props;

  return (
    <div
      className={cn(
        "grid items-start gap-x-2",
        compact ? "grid-cols-[78px_minmax(0,1fr)]" : "grid-cols-[96px_minmax(0,1fr)]"
      )}
    >
      <div className="flex min-h-[30px] min-w-0 items-center gap-1.5 text-[12.5px] text-secondary">
        <span className="truncate">{label}</span>
        {appendElement}
      </div>
      <div className={cn("-ml-1.5 flex min-h-[30px] min-w-0 flex-wrap items-center gap-1", childrenClassName)}>
        {children}
      </div>
    </div>
  );
}
