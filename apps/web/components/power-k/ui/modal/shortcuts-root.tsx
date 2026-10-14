/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Keyboard } from "lucide-react";
// plane imports
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@makeplane/propel/components/dialog";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { CloseOutline, SearchOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
// hooks
import { usePowerK } from "@/hooks/store/use-power-k";
// local imports
import { ShortcutRenderer } from "../renderer/shortcut";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary">
      {children}
    </kbd>
  );
}

/** The `?` help (J6): every shortcut, searchable, in three columns of sections. */
export const ShortcutsModal = observer(function ShortcutsModal(props: Props) {
  const { isOpen, onClose } = props;
  // states
  const [query, setQuery] = useState("");
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { commandRegistry } = usePowerK();

  // Get all commands from registry
  const allCommandsWithShortcuts = commandRegistry.getAllCommandsWithShortcuts();

  const handleClose = () => {
    onClose();
    setQuery("");
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Escape and outside press both close.
        if (!open) handleClose();
      }}
    >
      <DialogContent size="xl">
        <div className="flex max-h-[calc(100dvh-10rem)] min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2.5 px-[22px] pt-3.5 pb-2.5">
            <Keyboard className="size-[18px] shrink-0 text-secondary" strokeWidth={1.75} />
            <DialogTitle>{t("keyboard_shortcuts")}</DialogTitle>
            <span className="flex-1" />
            <label className="flex h-[30px] w-[260px] max-w-full items-center gap-2 rounded-lg border border-strong bg-layer-1 px-2.5 text-13 focus-within:border-accent-strong">
              <SearchOutline className="size-[13px] shrink-0 text-placeholder" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("power_k.shortcuts_modal.search_placeholder")}
                aria-label={t("power_k.shortcuts_modal.search_placeholder")}
                className="min-w-0 flex-1 bg-transparent text-primary placeholder-(--text-color-placeholder) outline-none"
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- the shortcut sheet opens on the search field
                autoFocus
              />
              <Kbd>/</Kbd>
            </label>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t("close")}
              icon={<Icon icon={CloseOutline} />}
              render={<DialogClose />}
            />
          </div>
          <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-[22px] pt-1.5 pb-[18px]">
            <ShortcutRenderer searchQuery={query} commands={allCommandsWithShortcuts} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-subtle px-[22px] py-2.5 text-12 text-tertiary">
            {t("power_k.shortcuts_modal.footer")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
