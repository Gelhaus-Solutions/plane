/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Command } from "cmdk";
import { CloseOutline, SearchOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import type { TPowerKContext, TPowerKPageType, TPowerKSearchResultsKeys } from "../../core/types";
import type { TPowerKSearch } from "../../hooks/use-power-k-search";
import { POWER_K_MODAL_PAGE_DETAILS } from "./constants";
import { PowerKModalContextIndicator } from "./context-indicator";
import { POWER_K_SEARCH_RESULTS_GROUPS_MAP } from "./search-results-map";

/** Every result, one group of results, or only the commands */
export type TPowerKScope = "all" | "actions" | TPowerKSearchResultsKeys;

type Props = {
  activePage: TPowerKPageType | null;
  context: TPowerKContext;
  onSearchChange: (value: string) => void;
  searchTerm: string;
  search: TPowerKSearch;
  scope: TPowerKScope;
  onScopeChange: (scope: TPowerKScope) => void;
};

function ScopeTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // The input keeps the focus, so the arrow keys still move through the results
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex h-[34px] items-center gap-1.5 px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors duration-[120ms]",
        active
          ? "text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent-primary"
          : "text-secondary hover:text-primary"
      )}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-[5px] bg-layer-2 px-[5px] text-11 leading-4 text-secondary">{count}</span>
      )}
    </button>
  );
}

export function PowerKModalHeader(props: Props) {
  const { context, searchTerm, onSearchChange, activePage, search, scope, onScopeChange } = props;
  // translation
  const { t } = useTranslation();
  // derived values
  const placeholder = activePage
    ? t(POWER_K_MODAL_PAGE_DETAILS[activePage].i18n_placeholder)
    : t("power_k.page_placeholders.default");
  const isSearchView = !activePage && searchTerm.trim() !== "";

  return (
    <div className="shrink-0 border-b border-subtle">
      {/* Context Indicator */}
      {context.shouldShowContextBasedActions && !activePage && (
        <PowerKModalContextIndicator
          activeContext={context.activeContext}
          handleClearContext={() => context.setShouldShowContextBasedActions(false)}
        />
      )}

      {/* Search Input */}
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <SearchOutline
          className={cn("size-[18px] shrink-0", isSearchView ? "text-accent-primary" : "text-secondary")}
        />
        <Command.Input
          value={searchTerm}
          onValueChange={onSearchChange}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-primary placeholder-(--text-color-placeholder) outline-none"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the command menu opens on its search field
          autoFocus
        />
        {isSearchView && (
          <span className="shrink-0 text-[11.5px] text-tertiary">
            {search.isSearching
              ? t("power_k.search_menu.searching")
              : t("power_k.search_menu.results_count", { count: search.resultsCount })}
          </span>
        )}
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={t("power_k.search_menu.clear_search")}
            className="flex-shrink-0 rounded-sm p-1 text-placeholder hover:bg-layer-1-hover hover:text-secondary"
          >
            <CloseOutline className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Scopes: every result, one group of them, or only the commands */}
      {isSearchView && (
        <nav aria-label={t("power_k.search_menu.scopes")} className="flex gap-0.5 overflow-x-auto px-2">
          <ScopeTab
            active={scope === "all"}
            label={t("common.all")}
            count={search.resultsCount}
            onClick={() => onScopeChange("all")}
          />
          {search.groups.map((group) => (
            <ScopeTab
              key={group.key}
              active={scope === group.key}
              label={t(POWER_K_SEARCH_RESULTS_GROUPS_MAP[group.key].i18n_title)}
              count={group.count}
              onClick={() => onScopeChange(group.key)}
            />
          ))}
          <ScopeTab
            active={scope === "actions"}
            label={t("power_k.search_menu.actions")}
            onClick={() => onScopeChange("actions")}
          />
        </nav>
      )}
    </div>
  );
}
