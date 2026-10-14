/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
// plane imports
import { WORKSPACE_DEFAULT_SEARCH_RESULT } from "@plane/constants";
import type { IWorkspaceSearchResults } from "@plane/types";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import type { TPowerKPageType, TPowerKSearchResultsKeys } from "../core/types";

const workspaceService = new WorkspaceService();

export type TPowerKSearch = {
  results: IWorkspaceSearchResults;
  /** How many results came back, over every group */
  resultsCount: number;
  /** The groups that have results, in the order the menu shows them */
  groups: { key: TPowerKSearchResultsKeys; count: number }[];
  isSearching: boolean;
  /** The term the shown results belong to */
  debouncedSearchTerm: string;
};

// The order of the groups in the list and in the scope tabs: what people look for most comes first
export const POWER_K_SEARCH_GROUP_ORDER: TPowerKSearchResultsKeys[] = [
  "issue",
  "page",
  "issue_view",
  "project",
  "cycle",
  "module",
  "workspace",
];

type TArgs = {
  activePage: TPowerKPageType | null;
  isWorkspaceLevel: boolean;
  searchTerm: string;
};

/** Searches the workspace (or the current project) for the command menu's term. */
export function usePowerKSearch({ activePage, isWorkspaceLevel, searchTerm }: TArgs): TPowerKSearch {
  const [results, setResults] = useState<IWorkspaceSearchResults>(WORKSPACE_DEFAULT_SEARCH_RESULT);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { workspaceSlug, projectId } = useParams();

  useEffect(() => {
    if (activePage || !workspaceSlug) return;
    if (!debouncedSearchTerm.trim()) {
      setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    workspaceService
      .searchWorkspace(workspaceSlug.toString(), {
        ...(projectId ? { project_id: projectId.toString() } : {}),
        search: debouncedSearchTerm,
        workspace_search: !projectId ? true : isWorkspaceLevel,
      })
      .then((response) => {
        if (!cancelled) setResults(response);
        return response;
      })
      .catch(() => {
        if (!cancelled) setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchTerm, isWorkspaceLevel, projectId, workspaceSlug, activePage]);

  const groups = POWER_K_SEARCH_GROUP_ORDER.map((key) => ({ key, count: results.results[key]?.length ?? 0 })).filter(
    (group) => group.count > 0
  );
  const resultsCount = groups.reduce((sum, group) => sum + group.count, 0);

  return { results, resultsCount, groups, isSearching, debouncedSearchTerm };
}
