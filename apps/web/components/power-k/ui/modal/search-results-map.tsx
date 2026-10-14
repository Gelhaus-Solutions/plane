/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  CyclesOutline,
  DocumentationOutline,
  GridOutline,
  ModuleOutline,
  ProjectsOutline,
  ViewsOutline,
  WorkItemsOutline,
} from "@makeplane/propel/icons";
// plane imports
import type {
  IWorkspaceDefaultSearchResult,
  IWorkspaceIssueSearchResult,
  IWorkspacePageSearchResult,
  IWorkspaceProjectSearchResult,
  IWorkspaceSearchResult,
} from "@plane/types";
import { generateWorkItemLink } from "@plane/utils";
// components
import type { TPowerKSearchResultsKeys } from "@/components/power-k/core/types";

type TTranslate = (key: string) => string;

export type TPowerKSearchResultGroupDetails = {
  icon: React.ComponentType<{ className?: string }>;
  /** The group's heading and scope tab, as an i18n key */
  i18n_title: string;
  /** The row's text */
  label: (item: any) => string;
  /** The muted text after it: the id of a work item, the kind and project of anything else */
  sub: (item: any, t: TTranslate) => string;
  path: (item: any, projectId: string | undefined) => string;
};

const withProject = (kind: string, identifier: string | undefined) => (identifier ? `${kind} · ${identifier}` : kind);

export const POWER_K_SEARCH_RESULTS_GROUPS_MAP: Record<TPowerKSearchResultsKeys, TPowerKSearchResultGroupDetails> = {
  cycle: {
    icon: CyclesOutline,
    i18n_title: "sidebar.cycles",
    label: (cycle: IWorkspaceDefaultSearchResult) => cycle.name,
    sub: (cycle: IWorkspaceDefaultSearchResult, t) => withProject(t("common.cycle"), cycle.project__identifier),
    path: (cycle: IWorkspaceDefaultSearchResult) =>
      `/${cycle?.workspace__slug}/projects/${cycle?.project_id}/cycles/${cycle?.id}`,
  },
  issue: {
    icon: WorkItemsOutline,
    i18n_title: "sidebar.work_items",
    label: (workItem: IWorkspaceIssueSearchResult) => workItem.name,
    sub: (workItem: IWorkspaceIssueSearchResult) => `${workItem.project__identifier}-${workItem.sequence_id}`,
    path: (workItem: IWorkspaceIssueSearchResult) =>
      generateWorkItemLink({
        workspaceSlug: workItem?.workspace__slug,
        projectId: workItem?.project_id,
        issueId: workItem?.id,
        projectIdentifier: workItem.project__identifier,
        sequenceId: workItem?.sequence_id,
      }),
  },
  issue_view: {
    icon: ViewsOutline,
    i18n_title: "sidebar.views",
    label: (view: IWorkspaceDefaultSearchResult) => view.name,
    sub: (view: IWorkspaceDefaultSearchResult, t) => withProject(t("common.view"), view.project__identifier),
    path: (view: IWorkspaceDefaultSearchResult) =>
      `/${view?.workspace__slug}/projects/${view?.project_id}/views/${view?.id}`,
  },
  module: {
    icon: ModuleOutline,
    i18n_title: "sidebar.modules",
    label: (module: IWorkspaceDefaultSearchResult) => module.name,
    sub: (module: IWorkspaceDefaultSearchResult, t) => withProject(t("common.module"), module.project__identifier),
    path: (module: IWorkspaceDefaultSearchResult) =>
      `/${module?.workspace__slug}/projects/${module?.project_id}/modules/${module?.id}`,
  },
  page: {
    icon: DocumentationOutline,
    i18n_title: "sidebar.pages",
    label: (page: IWorkspacePageSearchResult) => page.name,
    sub: (page: IWorkspacePageSearchResult, t) => withProject(t("common.page"), page.project__identifiers?.[0]),
    path: (page: IWorkspacePageSearchResult, projectId: string | undefined) => {
      let redirectProjectId = page?.project_ids?.[0];
      if (!!projectId && page?.project_ids?.includes(projectId)) redirectProjectId = projectId;
      return redirectProjectId
        ? `/${page?.workspace__slug}/projects/${redirectProjectId}/pages/${page?.id}`
        : `/${page?.workspace__slug}/wiki/${page?.id}`;
    },
  },
  project: {
    icon: ProjectsOutline,
    i18n_title: "sidebar.projects",
    label: (project: IWorkspaceProjectSearchResult) => project?.name,
    sub: (project: IWorkspaceProjectSearchResult, t) => withProject(t("common.project"), project.identifier),
    path: (project: IWorkspaceProjectSearchResult) => `/${project?.workspace__slug}/projects/${project?.id}/issues/`,
  },
  workspace: {
    icon: GridOutline,
    i18n_title: "workspaces",
    label: (workspace: IWorkspaceSearchResult) => workspace?.name,
    sub: (_workspace: IWorkspaceSearchResult, t) => t("common.workspace"),
    path: (workspace: IWorkspaceSearchResult) => `/${workspace?.slug}/`,
  },
};

/** The cmdk value of a search result row: unique per result, and it lets the preview find the row again. */
export const getPowerKSearchResultValue = (key: TPowerKSearchResultsKeys, id: string) => `search-result:${key}:${id}`;

/** The group and id a row's value names, or undefined for a row that is not a search result. */
export const parsePowerKSearchResultValue = (
  value: string | undefined
): { key: TPowerKSearchResultsKeys; id: string } | undefined => {
  if (!value?.startsWith("search-result:")) return undefined;
  const [, key, id] = value.split(":");
  if (!key || !id || !(key in POWER_K_SEARCH_RESULTS_GROUPS_MAP)) return undefined;
  return { key: key as TPowerKSearchResultsKeys, id };
};
