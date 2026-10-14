/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/blocks/empty-state";
// components
import { InsightsExportProvider } from "@/components/analytics/insights/export";
import { AnalyticsFilterBar } from "@/components/analytics/insights/filter-bar";
import { CyclesTab } from "@/components/analytics/insights/tabs/cycles";
import { IntakeTab } from "@/components/analytics/insights/tabs/intake";
import { ModulesTab } from "@/components/analytics/insights/tabs/modules";
import { OverviewTab } from "@/components/analytics/insights/tabs/overview";
import { PeopleTab } from "@/components/analytics/insights/tabs/people";
import { WorkItemsTab } from "@/components/analytics/insights/tabs/work-items";
import type { TInsightsTab } from "@/components/analytics/insights/types";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

const TABS: Record<TInsightsTab, ComponentType> = {
  overview: OverviewTab,
  "work-items": WorkItemsTab,
  cycles: CyclesTab,
  modules: ModulesTab,
  intake: IntakeTab,
  people: PeopleTab,
};

function AnalyticsPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation();
  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  const { workspaceProjectIds, loader } = useProject();
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const pageTitle = currentWorkspace?.name
    ? t(`workspace_analytics.page_label`, { workspace: currentWorkspace?.name })
    : undefined;
  const canPerformEmptyStateActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const Tab = TABS[params.tabId as TInsightsTab] ?? OverviewTab;

  if (!workspaceProjectIds) return <PageHead title={pageTitle} />;

  return (
    <>
      <PageHead title={pageTitle} />
      {workspaceProjectIds.length > 0 || loader === "init-loader" ? (
        <InsightsExportProvider>
          <AnalyticsFilterBar />
          <Tab />
        </InsightsExportProvider>
      ) : (
        <EmptyStateDetailed
          assetKey="project"
          title={t("workspace_projects.empty_state.no_projects.title")}
          description={t("workspace_projects.empty_state.no_projects.description")}
          actions={[
            {
              label: "Create a project",
              onClick: () => toggleCreateProjectModal(true),
              disabled: !canPerformEmptyStateActions,
            },
          ]}
        />
      )}
    </>
  );
}

export default observer(AnalyticsPage);
