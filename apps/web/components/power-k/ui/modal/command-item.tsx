/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Command } from "cmdk";

import { TickOutline } from "@makeplane/propel/icons";
// plane imports
import { cn } from "@plane/utils";
// local imports
import { KeySequenceBadge, ShortcutBadge } from "./command-item-shortcut-badge";

type Props = {
  icon?: React.ComponentType<{ className?: string }>;
  iconNode?: React.ReactNode;
  isDisabled?: boolean;
  isSelected?: boolean;
  keySequence?: string;
  label: string | React.ReactNode;
  /** Muted text after the label: a work item's id, a result's kind and project */
  sub?: string;
  /** More text the menu's own filter matches on */
  keywords?: string[];
  onSelect: () => void;
  shortcut?: string;
  value?: string;
};

export function PowerKModalCommandItem(props: Props) {
  const {
    icon: Icon,
    iconNode,
    isDisabled,
    isSelected,
    keySequence,
    label,
    sub,
    keywords,
    onSelect,
    shortcut,
    value,
  } = props;

  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="group/pk-item focus:outline-none"
      disabled={isDisabled}
    >
      <div
        className={cn("flex min-w-0 items-center gap-[9px] text-primary", {
          "opacity-70": isDisabled,
        })}
      >
        {Icon && <Icon className="size-4 shrink-0 text-secondary" />}
        {iconNode}
        <span className="min-w-0 truncate">{label}</span>
        {sub && <span className="ml-0.5 shrink-0 text-12 text-tertiary">{sub}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-tertiary">
        {isSelected && <TickOutline className="size-3.5 shrink-0 text-accent-primary" />}
        {keySequence && <KeySequenceBadge sequence={keySequence} />}
        {shortcut && <ShortcutBadge shortcut={shortcut} />}
      </div>
    </Command.Item>
  );
}
