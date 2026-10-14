/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
import { SettingsNavigation } from "@/components/settings/shell/navigation";

export default function SettingsLayout() {
  return (
    <>
      <ProjectsAppPowerKProvider />
      {/* In settings the sidebar becomes the settings navigation, on the canvas beside the inset panel */}
      <div className="relative flex size-full overflow-hidden">
        <SettingsNavigation className="hidden md:flex" />
        <main className="relative my-2 mr-2 ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-strong bg-surface-1 shadow-e1 md:ml-0">
          <ContentWrapper className="w-full bg-surface-1 md:flex">
            <div className="size-full overflow-hidden">
              <Outlet />
            </div>
          </ContentWrapper>
        </main>
      </div>
    </>
  );
}
