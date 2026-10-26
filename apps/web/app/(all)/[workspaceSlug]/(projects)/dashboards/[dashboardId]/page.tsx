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
import type { Route } from "./+types/page";

function WorkspaceDashboardPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, dashboardId } = params;
  const { t } = useTranslation();
  const { data: dashboard } = useDashboard(workspaceSlug, dashboardId);

  return (
    <>
      <PageHead title={dashboard ? `${dashboard.name} - ${t("dashboards.title")}` : t("dashboards.title")} />
      <DashboardRoot key={dashboardId} workspaceSlug={workspaceSlug} dashboardId={dashboardId} />
    </>
  );
}

export default observer(WorkspaceDashboardPage);
