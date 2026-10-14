/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";
import { observer } from "mobx-react";
import { Dialog, DialogContent } from "@makeplane/propel/components/dialog";
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceIssueSearchResult } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePowerK } from "@/hooks/store/use-power-k";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import type { TPowerKCommandConfig, TPowerKContext } from "../../core/types";
import { usePowerKSearch } from "../../hooks/use-power-k-search";
import type { TPowerKCommandsListProps } from "./commands-list";
import { PowerKModalFooter } from "./footer";
import type { TPowerKScope } from "./header";
import { PowerKModalHeader } from "./header";
import { PowerKSearchPreview } from "./preview";
import { POWER_K_SEARCH_RESULTS_GROUPS_MAP, parsePowerKSearchResultValue } from "./search-results-map";

type Props = {
  commandsListComponent: React.FC<TPowerKCommandsListProps>;
  context: TPowerKContext;
  hideFooter?: boolean;
  isOpen: boolean;
  onClose: () => void;
};

export const ProjectsAppPowerKModalWrapper = observer(function ProjectsAppPowerKModalWrapper(props: Props) {
  const { commandsListComponent: CommandsListComponent, context, hideFooter = false, isOpen, onClose } = props;
  // states
  const [searchTerm, setSearchTerm] = useState("");
  const [isWorkspaceLevel, setIsWorkspaceLevel] = useState(false);
  const [scope, setScope] = useState<TPowerKScope>("all");
  const [selectedValue, setSelectedValue] = useState("");
  // store hooks
  const { activePage, setActivePage } = usePowerK();
  const { setPeekIssue } = useIssueDetail();
  const { t } = useTranslation();
  const router = useAppRouter();
  // search
  const search = usePowerKSearch({
    activePage,
    isWorkspaceLevel: !context.params.projectId || isWorkspaceLevel,
    searchTerm,
  });
  const isSearchView = !activePage && searchTerm.trim() !== "";
  // A scope whose group has no results any more shows everything
  const activeScope: TPowerKScope =
    scope === "all" || scope === "actions" || search.groups.some((group) => group.key === scope) ? scope : "all";
  // The selected row, when it is a search result
  const selectedResult = parsePowerKSearchResultValue(selectedValue);
  const selectedItem = selectedResult
    ? search.results.results[selectedResult.key]?.find((item) => item.id === selectedResult.id)
    : undefined;

  const openSelectedResult = useCallback(() => {
    if (!selectedResult || !selectedItem) return;
    context.closePalette();
    router.push(
      POWER_K_SEARCH_RESULTS_GROUPS_MAP[selectedResult.key].path(selectedItem, context.params.projectId?.toString())
    );
  }, [context, router, selectedItem, selectedResult]);

  const peekSelectedResult = useCallback(() => {
    if (selectedResult?.key !== "issue" || !selectedItem) return;
    const workItem = selectedItem as IWorkspaceIssueSearchResult;
    context.closePalette();
    setPeekIssue({ workspaceSlug: workItem.workspace__slug, projectId: workItem.project_id, issueId: workItem.id });
  }, [context, selectedItem, selectedResult, setPeekIssue]);

  // Clearing the term leaves the scopes
  useEffect(() => {
    if (!searchTerm) setScope("all");
  }, [searchTerm]);

  // Handle command selection
  const handleCommandSelect = useCallback(
    (command: TPowerKCommandConfig) => {
      if (command.type === "action") {
        // Direct action - execute and potentially close
        command.action(context);
        if (command.closeOnSelect === true) {
          context.closePalette();
        }
      } else if (command.type === "change-page") {
        // Opens a selection page
        context.setActiveCommand(command);
        setActivePage(command.page);
        setSearchTerm("");
      }
    },
    [context, setActivePage]
  );

  // Handle selection page item selection
  const handlePageDataSelection = useCallback(
    (data: unknown) => {
      if (context.activeCommand?.type === "change-page") {
        context.activeCommand.onSelect(data, context);
      }
      // Go back to main page
      if (context.activeCommand?.closeOnSelect === true) {
        context.closePalette();
      }
    },
    [context]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl+K is toggled by the document-level ShortcutHandler, which this event still
      // reaches. Preventing the default only keeps cmdk's Ctrl+K vim binding from moving the
      // selection first.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        return;
      }

      // Cmd/Ctrl+Enter peeks the selected work item instead of opening it
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && selectedResult?.key === "issue") {
        e.preventDefault();
        peekSelectedResult();
        return;
      }

      // Escape closes palette or clears search
      if (e.key === "Escape") {
        e.preventDefault();
        if (searchTerm) {
          setSearchTerm("");
        } else {
          onClose();
        }
        return;
      }

      // Backspace clears context or goes back from page
      if (e.key === "Backspace" && !searchTerm) {
        e.preventDefault();
        if (activePage) {
          // Go back from selection page
          setActivePage(null);
          context.setActiveCommand(null);
        } else {
          // Hide context based actions
          context.setShouldShowContextBasedActions(false);
        }
        return;
      }
    },
    [searchTerm, activePage, onClose, setActivePage, context, selectedResult, peekSelectedResult]
  );

  // Reset state when modal closes
  useEffect(() => {
    if (isOpen) return;
    // Wait for the close animation. Reopening within the delay cancels the reset.
    const timeoutId = setTimeout(() => {
      setSearchTerm("");
      setScope("all");
      setSelectedValue("");
      setActivePage(null);
      context.setActiveCommand(null);
      context.setShouldShowContextBasedActions(true);
    }, 200);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const commandsList = (
    <>
      <Command.Empty className="px-[18px] py-6 text-13 text-tertiary">
        {t("power_k.search_menu.no_results")}
      </Command.Empty>
      <CommandsListComponent
        activePage={activePage}
        context={context}
        handleCommandSelect={handleCommandSelect}
        handlePageDataSelection={handlePageDataSelection}
        search={search}
        scope={activeScope}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />
    </>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open, eventDetails) => {
        // Escape is owned by `Command`'s `onKeyDown` below, which clears the search term before it
        // closes; letting Base UI's Escape through as well would skip that first step. Outside press
        // still closes, as the legacy headless `Dialog onClose` did.
        if (open || eventDetails.reason === "escape-key") return;
        onClose();
      }}
    >
      {/* 7B: the search view is 1000 px wide with a preview; the command list stays 672 */}
      <DialogContent size={isSearchView ? "xl" : "md"}>
        <Command
          filter={(value: string, term: string, keywords?: string[]) => {
            // Search results matched on the server; only the commands are filtered here
            if (value === "no-results" || value.startsWith("search-result:")) return 1;
            const needle = term.toLowerCase();
            return [value, ...(keywords ?? [])].some((text) => text.toLowerCase().includes(needle)) ? 1 : 0;
          }}
          shouldFilter={searchTerm.length > 0}
          value={selectedValue}
          onValueChange={setSelectedValue}
          onKeyDown={handleKeyDown}
          className="flex min-h-0 w-full flex-1 flex-col"
        >
          <PowerKModalHeader
            activePage={activePage}
            context={context}
            onSearchChange={setSearchTerm}
            searchTerm={searchTerm}
            search={search}
            scope={activeScope}
            onScopeChange={setScope}
          />
          {isSearchView ? (
            <div className="flex h-[540px] max-h-[calc(100dvh-18rem)] min-h-0">
              <Command.List
                className={cn(
                  "vertical-scrollbar scrollbar-sm min-h-0 min-w-0 flex-1 overflow-y-auto pt-0.5 pb-1.5 outline-none",
                  activeScope !== "actions" && search.resultsCount > 0 && "md:border-r md:border-subtle"
                )}
              >
                {commandsList}
              </Command.List>
              {activeScope !== "actions" && search.resultsCount > 0 && (
                <PowerKSearchPreview
                  results={search.results}
                  selectedValue={selectedValue}
                  searchTerm={search.debouncedSearchTerm}
                  onOpen={openSelectedResult}
                  onPeek={peekSelectedResult}
                  className="hidden w-[380px] flex-none md:flex"
                />
              )}
            </div>
          ) : (
            <Command.List className="vertical-scrollbar scrollbar-sm max-h-[min(600px,calc(100dvh-16rem))] min-h-0 flex-1 overflow-y-auto pt-0.5 pb-1.5 outline-none">
              {commandsList}
            </Command.List>
          )}
          {!hideFooter && (
            <PowerKModalFooter
              isWorkspaceLevel={isWorkspaceLevel}
              projectId={context.params.projectId?.toString()}
              onWorkspaceLevelChange={setIsWorkspaceLevel}
              showPeekHint={isSearchView && selectedResult?.key === "issue"}
            />
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
});
