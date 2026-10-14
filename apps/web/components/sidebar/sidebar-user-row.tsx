/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { SettingsOutline } from "@makeplane/propel/icons";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// components
import { HelpMenuRoot } from "@/components/workspace/sidebar/help-section/root";
import { UserMenuRoot } from "@/components/workspace/sidebar/user-menu-root";

/** The user (their menu), help and settings, at the bottom of the sidebar. */
export const SidebarUserRow = observer(function SidebarUserRow() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();

  return (
    <div className="flex items-center gap-1">
      <UserMenuRoot variant="row" />
      <HelpMenuRoot compact />
      <Tooltip label={`${t("settings")} G S`} side="top">
        <IconButton
          size="md"
          variant="ghost"
          icon={<Icon icon={SettingsOutline} />}
          aria-label={t("settings")}
          render={<Link href={`/${workspaceSlug?.toString() ?? ""}/settings/`} />}
          nativeButton={false}
        />
      </Tooltip>
    </div>
  );
});
