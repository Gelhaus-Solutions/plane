/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPowerKCommandConfig, TPowerKContext, TPowerKPageType } from "../../core/types";
import type { TPowerKSearch } from "../../hooks/use-power-k-search";
import { PowerKModalPagesList } from "../pages";
import { PowerKContextBasedPagesList } from "../pages/context-based";
import type { TPowerKScope } from "./header";
import { PowerKModalSearchMenu } from "./search-menu";

export type TPowerKCommandsListProps = {
  activePage: TPowerKPageType | null;
  context: TPowerKContext;
  handleCommandSelect: (command: TPowerKCommandConfig) => void;
  handlePageDataSelection: (data: unknown) => void;
  search: TPowerKSearch;
  scope: TPowerKScope;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  handleSearchMenuClose?: () => void;
};

export function ProjectsAppPowerKCommandsList(props: TPowerKCommandsListProps) {
  const {
    activePage,
    context,
    handleCommandSelect,
    handlePageDataSelection,
    search,
    scope,
    searchTerm,
    setSearchTerm,
    handleSearchMenuClose,
  } = props;

  return (
    <>
      <PowerKModalSearchMenu
        activePage={activePage}
        context={context}
        search={search}
        scope={scope}
        searchTerm={searchTerm}
        updateSearchTerm={setSearchTerm}
        handleSearchMenuClose={handleSearchMenuClose}
      />
      <PowerKContextBasedPagesList
        activeContext={context.activeContext}
        activePage={activePage}
        handleSelection={handlePageDataSelection}
      />
      {/* The commands are the Actions scope; a scope of results hides them */}
      {(scope === "all" || scope === "actions" || searchTerm.trim() === "") && (
        <PowerKModalPagesList
          activePage={activePage}
          context={context}
          onPageDataSelect={handlePageDataSelection}
          onCommandSelect={handleCommandSelect}
        />
      )}
    </>
  );
}
