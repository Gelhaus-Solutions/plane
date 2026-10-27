/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PrioritySelect as PrioritySelectBlock } from "@plane/blocks/property-select";
import type { SelectTooltip, SelectTooltipOverride, SelectVariant } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import type { TIssuePriorities } from "@plane/types";
// hooks
import { usePriority } from "@/hooks/store/use-priority";

type PrioritySelectWebProps = {
  /** value-agnostic e2e selector — forwarded to the block's trigger as data-testid */
  testId?: string;
  /** Current priority key (`null` / `undefined` when none). */
  value: TIssuePriorities | null | undefined;
  /** The custom priority the item names (E35), by id. */
  optionId?: string | null;
  /** Only the five levels, where the custom priority cannot be kept (a workspace draft). */
  levelsOnly?: boolean;
  /** Emits the next priority key and the custom priority picked, `null` for a built-in one. */
  onChange: (value: TIssuePriorities, optionId: string | null) => void;
  variant: SelectVariant;
  disabled?: boolean;
  placeholder?: string;
  onClose?: () => void;
  className?: string;
  tooltip?: SelectTooltip;
  /** Tab order of the trigger, for forms that sequence focus explicitly (`ETabIndices`). */
  tabIndex?: number;
};

/**
 * Web binding for the presentational `PrioritySelect` block: it supplies the workspace's priorities
 * (E35), asked once per workspace, and the localized default placeholder.
 */
export const PrioritySelect = observer(function PrioritySelect(props: PrioritySelectWebProps) {
  const { placeholder, tooltip, onChange, levelsOnly = false, ...rest } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = levelsOnly ? "" : (workspaceSlug?.toString() ?? "");
  const { getPriorities, fetchPriorities } = usePriority();
  const priorities = slug ? getPriorities(slug) : undefined;

  useEffect(() => {
    if (slug && !priorities) void fetchPriorities(slug).catch(() => undefined);
  }, [slug, priorities, fetchPriorities]);

  const resolvedTooltip = useMemo<SelectTooltipOverride | undefined>(() => {
    if (!tooltip) return undefined;
    const override = typeof tooltip === "object" ? tooltip : undefined;
    return {
      heading: override?.heading ?? t("common.priority"),
      emptyContent: override?.emptyContent ?? t("common.none"),
    };
  }, [tooltip, t]);

  return (
    <PrioritySelectBlock
      placeholder={placeholder ?? t("common.priority")}
      tooltip={resolvedTooltip}
      priorities={priorities}
      onChange={(value, optionId) => onChange(value, optionId ?? null)}
      {...rest}
    />
  );
});
