/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

type TSidebarNavItem = {
  className?: string;
  isActive?: boolean;
  children?: React.ReactNode;
};

export function SidebarNavItem(props: TSidebarNavItem) {
  const { className, isActive, children } = props;
  return (
    <div
      className={cn(
        "group relative flex h-7 w-full min-w-0 cursor-pointer items-center justify-between gap-[9px] rounded-[7px] px-2 text-13 text-primary transition-colors duration-[120ms] outline-none",
        {
          "bg-layer-1-selected [&_svg]:text-accent-primary": isActive,
          "hover:bg-layer-1-hover [&_svg]:text-secondary": !isActive,
        },
        className
      )}
    >
      {children}
    </div>
  );
}
