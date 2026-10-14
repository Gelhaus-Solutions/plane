/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { ScrollArea } from "@makeplane/propel/components/scroll-area";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import useSize from "@/hooks/use-window-size";
// local imports
import { SidebarHeader } from "./sidebar-header";
import { SidebarUserRow } from "./sidebar-user-row";

type TSidebarWrapperProps = {
  children: React.ReactNode;
};

/** The Pulse sidebar: the workspace, search and create on top, the tree in the middle, the user row at the bottom. */
export const SidebarWrapper = observer(function SidebarWrapper(props: TSidebarWrapperProps) {
  const { children } = props;
  // store hooks
  const { toggleSidebar, sidebarCollapsed } = useAppTheme();
  const windowSize = useSize();
  // refs
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClickDetector(ref, () => {
    if (sidebarCollapsed === false && window.innerWidth < 768) {
      toggleSidebar();
    }
  });

  useEffect(() => {
    if (windowSize[0] < 768 && !sidebarCollapsed) toggleSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize]);

  return (
    <div ref={ref} className="flex h-full w-full flex-col gap-3.5 py-2.5 pr-2 pl-2.5">
      <SidebarHeader />
      <ScrollArea orientation="vertical">
        <div className="flex flex-col gap-3.5 overflow-x-hidden pb-0.5">{children}</div>
      </ScrollArea>
      <SidebarUserRow />
    </div>
  );
});
