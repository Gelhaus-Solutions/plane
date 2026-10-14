/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// hooks
import { usePowerK } from "@/hooks/store/use-power-k";
// local imports
import type { TPowerKContext, TPowerKPageType } from "../../core/types";
import type { TPowerKSearch } from "../../hooks/use-power-k-search";
import type { TPowerKScope } from "./header";
import { PowerKModalNoSearchResultsCommand } from "./no-results-command";
import { PowerKModalSearchResults } from "./search-results";

type Props = {
  activePage: TPowerKPageType | null;
  context: TPowerKContext;
  search: TPowerKSearch;
  scope: TPowerKScope;
  searchTerm: string;
  updateSearchTerm: (value: string) => void;
  handleSearchMenuClose?: () => void;
};

/** The search results in the command menu's list; the search itself runs in the menu (usePowerKSearch). */
export function PowerKModalSearchMenu(props: Props) {
  const { activePage, context, search, scope, searchTerm, updateSearchTerm, handleSearchMenuClose } = props;
  // store hooks
  const { togglePowerKModal } = usePowerK();

  if (activePage || searchTerm.trim() === "" || scope === "actions") return null;

  const handleClosePalette = () => {
    handleSearchMenuClose?.();
    togglePowerKModal(false);
  };

  // Show the empty state only once the term has been searched and nothing came back
  const searched = !search.isSearching && search.debouncedSearchTerm.trim() === searchTerm.trim();
  if (searched && search.resultsCount === 0) {
    return (
      <PowerKModalNoSearchResultsCommand
        context={context}
        searchTerm={searchTerm}
        updateSearchTerm={updateSearchTerm}
      />
    );
  }

  return (
    <PowerKModalSearchResults
      closePalette={handleClosePalette}
      results={search.results}
      scope={scope}
      searchTerm={search.debouncedSearchTerm}
    />
  );
}
