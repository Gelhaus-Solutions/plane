/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { HelpOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
// ui
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
// components
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
import { PlaneVersionNumber } from "@/components/global/version-number";
// hooks
import { usePowerK } from "@/hooks/store/use-power-k";

type HelpMenuRootProps = {
  /** A small icon button that opens the menu upward, for the sidebar's bottom row. */
  compact?: boolean;
};

export const HelpMenuRoot = observer(function HelpMenuRoot({ compact = false }: HelpMenuRootProps) {
  // store hooks
  const { t } = useTranslation();
  const { toggleShortcutsListModal } = usePowerK();
  // states
  const [isNeedHelpOpen, setIsNeedHelpOpen] = useState(false);

  return (
    <Menu onOpenChange={setIsNeedHelpOpen}>
      {/* propel: `AppSidebarItem` takes no arbitrary props, so it cannot be the Base UI trigger:
          the popup would have no element to anchor to. The trigger is a plain button wearing
          the same chrome, with the item's own icon part inside it. */}
      <MenuTrigger
        render={
          compact ? (
            <button
              type="button"
              className="grid size-7 place-items-center rounded-[7px] text-secondary transition-colors duration-[120ms] hover:bg-layer-1-hover hover:text-primary"
              aria-label={t("power_k.group_titles.help")}
            >
              <HelpOutline className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              className="group flex flex-col items-center justify-center gap-0.5 text-tertiary"
              aria-label={t("power_k.group_titles.help")}
            >
              <AppSidebarItem.Icon icon={<HelpOutline className="size-5" />} highlight={isNeedHelpOpen} />
            </button>
          )
        }
      />
      <MenuContent
        side={compact ? "top" : "bottom"}
        align={compact ? "start" : "end"}
        footer={
          <div className="text-11 text-secondary">
            <PlaneVersionNumber />
          </div>
        }
      >
        <MenuItem label={t("keyboard_shortcuts")} onClick={() => toggleShortcutsListModal(true)} />
      </MenuContent>
    </Menu>
  );
});
