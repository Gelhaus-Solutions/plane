/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import { substringMatch } from "@plane/utils";
// components
import type { TPowerKCommandConfig, TPowerKCommandGroup } from "@/components/power-k/core/types";
import { KeySequenceBadge, ShortcutBadge } from "@/components/power-k/ui/modal/command-item-shortcut-badge";
// types
import { CONTEXT_ENTITY_MAP } from "@/components/power-k/ui/pages/context-based";
// local imports
import { POWER_K_GROUP_I18N_TITLES, POWER_K_GROUP_PRIORITY } from "./shared";

type Props = {
  searchQuery: string;
  commands: TPowerKCommandConfig[];
};

// Interpolated in place of the query so the translated sentence can be rendered around it
const QUERY_SENTINEL = "\u0000";

export function ShortcutRenderer(props: Props) {
  const { searchQuery, commands } = props;
  // translation
  const { t } = useTranslation();
  // The query's position in the sentence varies by language, so split the translation on a
  // sentinel and give only the query its emphasis
  const [noResultsBefore, noResultsAfter] = t("power_k.shortcuts_modal.no_results", {
    query: QUERY_SENTINEL,
  }).split(QUERY_SENTINEL);

  // Apply search filter
  const filteredCommands = commands.filter((command) => substringMatch(t(command.i18n_title), searchQuery));

  // Group commands - separate contextual by context type, others by group
  type GroupedCommands = {
    key: string;
    title: string;
    priority: number;
    commands: TPowerKCommandConfig[];
  };

  const groupedCommands: GroupedCommands[] = [];

  filteredCommands.forEach((command) => {
    if (command.group === "contextual") {
      // For contextual commands, group by context type
      const contextKey = `contextual-${command.contextType}`;
      let group = groupedCommands.find((g) => g.key === contextKey);

      if (!group) {
        group = {
          key: contextKey,
          title: t(CONTEXT_ENTITY_MAP[command.contextType].i18n_title),
          priority: POWER_K_GROUP_PRIORITY.contextual,
          commands: [],
        };
        groupedCommands.push(group);
      }
      group.commands.push(command);
    } else {
      // For other commands, group by command group
      const groupKey = command.group || "general";
      let group = groupedCommands.find((g) => g.key === groupKey);

      if (!group) {
        group = {
          key: groupKey,
          title: t(POWER_K_GROUP_I18N_TITLES[groupKey as TPowerKCommandGroup]),
          priority: POWER_K_GROUP_PRIORITY[groupKey as TPowerKCommandGroup],
          commands: [],
        };
        groupedCommands.push(group);
      }
      group.commands.push(command);
    }
  });

  // Sort groups by priority
  groupedCommands.sort((a, b) => a.priority - b.priority);

  if (groupedCommands.length === 0) {
    return (
      <p className="py-10 text-center text-13 text-secondary">
        {noResultsBefore}
        <span className="font-semibold italic">{searchQuery}</span>
        {noResultsAfter}
      </p>
    );
  }

  // Three columns, the sections dealt round them in order
  const columns: GroupedCommands[][] = [[], [], []];
  groupedCommands.forEach((group, index) => columns[index % 3].push(group));

  return (
    <div className="grid grid-cols-1 gap-x-7 gap-y-1 md:grid-cols-3">
      {columns.map((column) => (
        <div key={column.map((group) => group.key).join("|") || "empty"} className="flex flex-col">
          {column.map((group) => (
            <section key={group.key} className="flex flex-col">
              <h3 className="mt-2 flex h-[34px] items-center text-[11.5px] font-semibold tracking-[0.05em] text-tertiary uppercase">
                {group.title}
              </h3>
              {group.commands.map((command) => (
                <div
                  key={command.id}
                  className="flex h-[30px] items-center gap-2.5 border-b border-subtle text-13 text-primary"
                >
                  <span className="min-w-0 truncate">{t(command.i18n_title)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-[3px]">
                    {command.keySequence && <KeySequenceBadge sequence={command.keySequence} />}
                    {(command.shortcut || command.modifierShortcut) && (
                      <ShortcutBadge shortcut={command.shortcut || command.modifierShortcut} />
                    )}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
