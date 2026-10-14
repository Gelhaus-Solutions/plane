/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { AddOutline, SearchOutline } from "@makeplane/propel/icons";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// components
import { WorkspaceMenuRoot } from "@/components/workspace/sidebar/workspace-menu-root";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { usePowerK } from "@/hooks/store/use-power-k";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

/** Workspace switcher, search (the command menu) and create, at the top of the sidebar. */
export const SidebarHeader = observer(function SidebarHeader() {
  const { t } = useTranslation();
  // store hooks
  const { togglePowerKModal } = usePowerK();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { joinedProjectIds } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const canCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const createDisabled = joinedProjectIds.length === 0 || !canCreateIssue;

  return (
    <div className="flex items-center gap-1">
      <WorkspaceMenuRoot variant="sidebar-header" />
      <Tooltip label={`${t("search")} ⌘K`} side="bottom">
        <IconButton
          size="md"
          variant="ghost"
          icon={<Icon icon={SearchOutline} />}
          aria-label={t("search")}
          onClick={() => togglePowerKModal(true)}
        />
      </Tooltip>
      <Tooltip label={`${t("sidebar.new_work_item")} C`} side="bottom">
        <IconButton
          size="md"
          variant="primary"
          icon={<Icon icon={AddOutline} />}
          aria-label={t("sidebar.new_work_item")}
          disabled={createDisabled}
          onClick={() => toggleCreateIssueModal(true)}
        />
      </Tooltip>
    </div>
  );
});
