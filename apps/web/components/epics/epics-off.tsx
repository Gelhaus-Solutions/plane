/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles } from "@plane/types";
// components
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

/** What a project's epic screens show while its Epics switch is off (D45); an admin can turn it on from here. */
export const EpicsOff = observer(function EpicsOff(props: { workspaceSlug: string; projectId: string }) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <DetailedEmptyState
        title={t("epics.off.title")}
        description={t("epics.off.description")}
        primaryButton={{
          text: t("epics.off.action"),
          onClick: () => router.push(`/${workspaceSlug}/settings/projects/${projectId}/features`),
          disabled: !isAdmin,
        }}
      />
    </div>
  );
});
