/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PriorityIcon, PriorityRowIcon } from "../icons/priority-icon";
import type { TIssuePriorities, TWorkspacePriority } from "@plane/types";
import { Select } from "../select/select";
import type { SelectTooltip, SelectVariant } from "../select/types";

/** A single priority the picker offers. Sourced from the hardcoded `ISSUE_PRIORITIES` list. */
export type PriorityOption = {
  key: TIssuePriorities;
  title: string;
};

export type PrioritySelectProps = {
  /** Selected priority key (`null` / `undefined` when none). */
  value: TIssuePriorities | null | undefined;
  /**
   * Emits the next priority key, and with `priorities` also the custom priority picked (`null` for a built-in
   * one, which stands for its level).
   */
  onChange: (value: TIssuePriorities, optionId?: string | null) => void;
  /** The workspace's priorities (E35): the picker groups them by level. Without them it offers the five levels. */
  priorities?: TWorkspacePriority[];
  /** The custom priority the item names, by id; the level's built-in one shows when it names none. */
  optionId?: string | null;
  /** Controls trigger chrome, button sizing, and arrow visibility. Use `icon-*` for prepend-only. */
  variant: SelectVariant;
  disabled?: boolean;
  placeholder?: string;
  onClose?: () => void;
  className?: string;
  tooltip?: SelectTooltip;
  /** Forwarded to the trigger as `data-testid`: a value-agnostic e2e selector. */
  testId?: string;
  /** Tab order of the trigger, for forms that sequence focus explicitly (e.g. the work item create modal). */
  tabIndex?: number;
};

/**
 * Presentational priority picker built on the generic single-select `Select`. Given the workspace's
 * `priorities` it offers them grouped by level; without them it offers the five levels of
 * `ISSUE_PRIORITIES`. The client supplies the selected key (and custom priority), an `onChange`
 * that persists it, and the trigger chrome via `variant`.
 */
export function PrioritySelect(props: PrioritySelectProps) {
  if (props.priorities?.length) return <WorkspacePrioritySelect {...props} priorities={props.priorities} />;
  return <LevelPrioritySelect {...props} />;
}

// What the built-in priorities are called until someone renames one; those show in the viewer's language
const BUILTIN_NAMES: Record<TIssuePriorities, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

/** A workspace priority's name (E35): a built-in one nobody renamed in the viewer's language. */
export const workspacePriorityLabel = (
  t: (key: string) => string,
  priority: Pick<TWorkspacePriority, "name" | "key" | "is_builtin">
) =>
  priority.is_builtin && priority.key && priority.name === BUILTIN_NAMES[priority.key]
    ? t(priority.key) || priority.name
    : priority.name;

/** The workspace's priorities (E35, r15-01): grouped by level, a custom one under its level in its own icon. */
function WorkspacePrioritySelect(props: PrioritySelectProps & { priorities: TWorkspacePriority[] }) {
  const {
    value,
    onChange,
    priorities,
    optionId,
    variant,
    disabled = false,
    placeholder = "",
    onClose,
    className,
    tooltip,
    testId,
    tabIndex,
  } = props;
  const { t } = useTranslation();

  const named = optionId ? priorities.find((priority) => priority.id === optionId) : undefined;
  const selected =
    named ?? (value ? priorities.find((priority) => priority.is_builtin && priority.level === value) : undefined);

  const labelOf = (priority: TWorkspacePriority) => workspacePriorityLabel(t, priority);

  return (
    <Select<TWorkspacePriority>
      getValues={() => priorities}
      value={selected ?? null}
      onChange={(id) => {
        const priority = priorities.find((row) => row.id === id);
        if (priority) onChange(priority.level, priority.is_builtin ? null : priority.id);
      }}
      disabled={disabled}
      placeholder={placeholder}
      showSearch={priorities.length > 5}
      onClose={onClose}
      pinSelected={false}
      getOptionValue={(priority) => priority.id}
      getOptionLabel={labelOf}
      getOptionGroup={(priority) => t(priority.level) || priority.level}
      getOptionIcon={(priority) => <PriorityRowIcon priority={priority} className="size-4" />}
    >
      <Select.Trigger<TWorkspacePriority>
        disabled={disabled}
        variant={variant}
        tabIndex={tabIndex}
        className={className}
        data-testid={testId}
        prependIcon={(rows) => <PriorityRowIcon priority={rows[0] ?? selected} />}
        label={(rows) => (rows[0] ? labelOf(rows[0]) : placeholder)}
        tooltip={tooltip}
      >
        {(rows) => {
          const priority = rows[0];
          const label = priority ? labelOf(priority) : placeholder;
          return (!!priority || !!placeholder) && <span className="min-w-0 grow truncate text-left">{label}</span>;
        }}
      </Select.Trigger>
    </Select>
  );
}

/** The five levels, for where a workspace's priorities are not at hand. */
function LevelPrioritySelect(props: PrioritySelectProps) {
  const {
    value,
    onChange,
    variant,
    disabled = false,
    placeholder = "",
    onClose,
    className,
    tooltip,
    testId,
    tabIndex,
  } = props;
  const { t } = useTranslation();

  const selected = value ? (ISSUE_PRIORITIES.find((priority) => priority.key === value) ?? null) : null;

  // Priority titles are shipped as English strings; prefer the localized copy keyed off `key`.
  const labelOf = (option: PriorityOption) => t(option.key) || option.title;

  return (
    <Select<PriorityOption>
      getValues={() => ISSUE_PRIORITIES}
      value={selected}
      onChange={(key) => onChange((key || "none") as TIssuePriorities)}
      disabled={disabled}
      placeholder={placeholder}
      showSearch={false}
      onClose={onClose}
      pinSelected={false}
      getOptionValue={(option) => option.key}
      getOptionLabel={labelOf}
      getOptionIcon={(option) => <PriorityIcon priority={option.key} className="size-4" />}
    >
      <Select.Trigger<PriorityOption>
        disabled={disabled}
        variant={variant}
        tabIndex={tabIndex}
        className={className}
        data-testid={testId}
        prependIcon={(priorities) => {
          const priority = priorities[0]?.key ?? "none";
          return <PriorityIcon priority={priority} />;
        }}
        label={(priorities) => (priorities[0] ? labelOf(priorities[0]) : placeholder)}
        tooltip={tooltip}
      >
        {(priorities) => {
          const priority = priorities[0];
          const label = priority ? labelOf(priority) : placeholder;
          return (!!priority || !!placeholder) && <span className="min-w-0 grow truncate text-left">{label}</span>;
        }}
      </Select.Trigger>
    </Select>
  );
}
