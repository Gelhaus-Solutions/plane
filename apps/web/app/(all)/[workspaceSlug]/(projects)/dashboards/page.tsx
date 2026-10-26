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
import { DashboardsListRoot } from "@/components/dashboards/dashboards-list";
import type { Route } from "./+types/page";

function WorkspaceDashboardsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();

  return (
    <>
      <PageHead title={t("dashboards.title")} />
      <DashboardsListRoot workspaceSlug={workspaceSlug} />
    </>
  );
}

export default observer(WorkspaceDashboardsPage);
