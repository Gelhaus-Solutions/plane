/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { ArrowNarrowLeftOutline, StackLayersOutline } from "@makeplane/propel/icons";
import { WEB_BASE_URL } from "@plane/constants";
import { cn } from "@plane/utils";
// hooks
import { useInstance, useTheme } from "@/hooks/store";
// components
import { AdminSidebarAdminRow } from "./sidebar-admin-row";
import { AdminSidebarMenu } from "./sidebar-menu";

// The host the instance is served on; WEB_BASE_URL is empty when web and God mode share an origin
const instanceHost = () => {
  try {
    return new URL(WEB_BASE_URL || window.location.origin).host;
  } catch {
    return window.location.host;
  }
};

/**
 * The God mode sidebar (round 12, `r12_godmode.py`): the brand with the God mode badge, the instance's host and
 * version, the sections, the way back to Plane and the signed-in admin. It sits on the canvas beside the inset panel;
 * below md it slides over the panel and the header's hamburger opens it.
 */
export const AdminSidebar = observer(function AdminSidebar() {
  // store
  const { instance } = useInstance();
  const { isSidebarCollapsed, toggleSidebar } = useTheme();

  const ref = useRef<HTMLElement>(null);

  useOutsideClickDetector(ref, () => {
    if (isSidebarCollapsed === false && window.innerWidth < 768) toggleSidebar(true);
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) toggleSidebar(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [toggleSidebar]);

  const version = instance?.current_version;

  return (
    <nav
      ref={ref}
      aria-label="God mode"
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex w-[240px] shrink-0 flex-col gap-3 bg-canvas py-2.5 pr-2 pl-2.5 transition-transform duration-300 md:relative md:translate-x-0",
        isSidebarCollapsed ? "-translate-x-full" : "translate-x-0 shadow-raised-200 md:shadow-none"
      )}
    >
      <div className="flex h-[30px] items-center gap-2 px-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-accent-primary text-on-color">
          <StackLayersOutline className="size-3" />
        </span>
        <span className="text-13 font-semibold text-primary">Plane</span>
        <span className="inline-flex h-[18px] items-center rounded-[5px] bg-danger-subtle px-1.5 text-10 font-bold tracking-[0.06em] text-danger-primary">
          GOD MODE
        </span>
      </div>
      <div className="-mt-1.5 truncate px-2 text-11 text-tertiary">
        {instanceHost()}
        {version && ` · ${version}`}
      </div>
      <AdminSidebarMenu />
      <a
        href={encodeURI(WEB_BASE_URL + "/")}
        className="flex h-7 items-center gap-[9px] rounded-[7px] px-2 text-13 text-secondary transition-colors duration-[120ms] hover:bg-layer-1-hover"
      >
        <ArrowNarrowLeftOutline className="size-3.5 shrink-0" />
        <span className="truncate">Back to Plane</span>
      </a>
      <AdminSidebarAdminRow />
    </nav>
  );
});
