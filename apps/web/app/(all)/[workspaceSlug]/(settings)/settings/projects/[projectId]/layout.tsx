/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
// components
import { getProjectActivePath } from "@/components/settings/helper";
import { SettingsMobileNav } from "@/components/settings/mobile/nav";
// layouts
import { ProjectAuthWrapper } from "@/layouts/auth-layout/project-wrapper";
// types
import type { Route } from "./+types/layout";
import { SettingsNavigation } from "@/components/settings/shell/navigation";

function ProjectDetailSettingsLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // router
  const pathname = usePathname();

  return (
    <>
      <SettingsMobileNav hamburgerContent={SettingsNavigation} activePath={getProjectActivePath(pathname) || ""} />
      <div className="inset-y-0 flex h-full w-full flex-row">
        <div className="relative flex size-full">
          <ProjectAuthWrapper workspaceSlug={workspaceSlug} projectId={projectId}>
            <Outlet />
          </ProjectAuthWrapper>
        </div>
      </div>
    </>
  );
}

export default observer(ProjectDetailSettingsLayout);
