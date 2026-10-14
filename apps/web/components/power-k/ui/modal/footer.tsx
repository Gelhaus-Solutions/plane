/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Switch } from "@makeplane/propel/components/switch";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  isWorkspaceLevel: boolean;
  projectId: string | undefined;
  onWorkspaceLevelChange: (value: boolean) => void;
  /** ⌘↵ peeks the selected work item: shown while there are results to peek */
  showPeekHint?: boolean;
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary">
      {children}
    </kbd>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-[3px]">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
      {label}
    </span>
  );
}

export const PowerKModalFooter = observer(function PowerKModalFooter(props: Props) {
  const { isWorkspaceLevel, projectId, onWorkspaceLevelChange, showPeekHint = false } = props;
  // translation
  const { t } = useTranslation();
  const { platform } = usePlatformOS();
  const mod = platform === "MacOS" ? "⌘" : "Ctrl";

  return (
    <div className="flex w-full shrink-0 flex-wrap items-center gap-3 border-t border-subtle px-3.5 py-2 text-[11.5px] text-tertiary">
      <Hint keys={["↑", "↓"]} label={t("power_k.footer.move")} />
      <Hint keys={["↵"]} label={t("power_k.footer.open")} />
      {showPeekHint && <Hint keys={[`${mod}↵`]} label={t("power_k.footer.open_in_peek")} />}
      <span className="flex-1" />
      {projectId && (
        <span className="flex items-center gap-2">
          {t("power_k.footer.workspace_level")}
          <Switch
            size="sm"
            checked={isWorkspaceLevel}
            onCheckedChange={onWorkspaceLevelChange}
            aria-label={t("power_k.footer.workspace_level")}
          />
        </span>
      )}
      <Hint keys={["Esc"]} label={t("power_k.footer.close")} />
    </div>
  );
});
