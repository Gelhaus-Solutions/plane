/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// plane internal packages
import { cn } from "@plane/utils";
// hooks
import { useTheme } from "@/hooks/store";
import { useSidebarMenu } from "@/hooks/use-sidebar-menu";

/** The God mode sections, as 28 px rows with the selected tint and an accent icon. */
export const AdminSidebarMenu = observer(function AdminSidebarMenu() {
  // router
  const pathName = usePathname();
  // store hooks
  const { toggleSidebar } = useTheme();
  // derived values
  const sidebarMenu = useSidebarMenu();

  // Below md the sidebar covers the panel, so picking a section closes it
  const handleItemClick = () => {
    if (window.innerWidth < 768) toggleSidebar(true);
  };

  return (
    <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
      {sidebarMenu.map((item) => {
        const isActive = item.href === pathName || !!pathName?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={handleItemClick}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-7 w-full min-w-0 items-center gap-[9px] rounded-[7px] px-2 text-13 text-primary transition-colors duration-[120ms] outline-none",
              {
                "bg-layer-1-selected [&_svg]:text-accent-primary": isActive,
                "hover:bg-layer-1-hover [&_svg]:text-secondary": !isActive,
              }
            )}
          >
            <item.Icon className="size-4 shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
});
