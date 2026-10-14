/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
// plane web components
import { ProjectAppSidebar } from "./_sidebar";
import { ExtendedProjectSidebar } from "./extended-project-sidebar";

function WorkspaceLayout() {
  return (
    <>
      <ProjectsAppPowerKProvider />
      <div className="relative flex size-full overflow-hidden">
        <ProjectAppSidebar />
        <ExtendedProjectSidebar />
        {/* The content panel, inset in the canvas */}
        <main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-strong bg-surface-1 shadow-e1">
          {/* The peek's portal covers the panel but takes no clicks itself, or the header and toolbar would not get them */}
          <div id="full-screen-portal" className="pointer-events-none absolute inset-0 w-full *:pointer-events-auto" />
          <Outlet />
        </main>
      </div>
    </>
  );
}

export default observer(WorkspaceLayout);
