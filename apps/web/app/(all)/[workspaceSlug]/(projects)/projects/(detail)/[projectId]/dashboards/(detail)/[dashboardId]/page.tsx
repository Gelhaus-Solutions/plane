/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { DashboardRoot } from "@/components/dashboards/dashboard-root";
import { useDashboard } from "@/components/dashboards/use-dashboards";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

/** A workspace dashboard opened from a project: it counts that project alone (PLANE-296) */
function ProjectDashboardPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, dashboardId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { data: dashboard } = useDashboard(workspaceSlug, dashboardId);
  const project = getProjectById(projectId);

  return (
    <>
      <PageHead
        title={dashboard ? `${dashboard.name} - ${project?.name ?? t("dashboards.title")}` : t("dashboards.title")}
      />
      <DashboardRoot
        key={`${projectId}/${dashboardId}`}
        workspaceSlug={workspaceSlug}
        dashboardId={dashboardId}
        projectId={projectId}
      />
    </>
  );
}

export default observer(ProjectDashboardPage);
