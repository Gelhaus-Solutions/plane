/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import {
  BarOutline,
  ChevronRightOutline,
  LinkOutline,
  MoreHorizontalOutline,
  NewTabOutline,
  PreferencesOutline,
} from "@makeplane/propel/icons";
// plane imports
import { EIssueFilterType, ISSUE_STORE_TO_FILTERS_MAP, SPACE_BASE_PATH, SPACE_BASE_URL } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ProjectBadge } from "@plane/blocks/project-badge";
import { setToast } from "@plane/blocks/toast";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { DisplayFiltersSelection, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
// local imports
import { BoardSwimlanes } from "./board-swimlanes";
import { WorkItemsLayoutTabs } from "./layout-tabs";
import { WorkItemsPQLToolbar } from "./pql-toolbar";

/**
 * The header of a project's work item list (2A): the path with the page's actions, the title with the item count, the
 * layouts as tabs, and the toolbar with Filters or PQL and the display options.
 */
export const WorkItemsHeader = observer(function WorkItemsHeader() {
  const { workspaceSlug: routeWorkspaceSlug, projectId: routeProjectId } = useParams();
  const workspaceSlug = routeWorkspaceSlug?.toString() ?? "";
  const projectId = routeProjectId?.toString() ?? "";
  const { t } = useTranslation();
  // states
  const [analyticsModal, setAnalyticsModal] = useState(false);
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { currentProjectDetails } = useProject();
  const { toggleCreateViewModal } = useCommandPalette();
  const {
    issues: { getGroupIssueCount },
    issuesFilter: { issueFilters, updateFilters },
  } = useIssues(EIssuesStoreType.PROJECT);
  // derived values
  const count = getGroupIssueCount(undefined, undefined, false);
  const activeLayout = issueFilters?.displayFilters?.layout;
  const layoutDisplayFiltersOptions = activeLayout
    ? ISSUE_STORE_TO_FILTERS_MAP[EIssuesStoreType.PROJECT]?.layoutOptions[activeLayout]
    : undefined;
  const spaceAppUrl =
    (SPACE_BASE_URL.trim() === "" && typeof window !== "undefined" ? window.location.origin : SPACE_BASE_URL) +
    SPACE_BASE_PATH;

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) =>
      void updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, { layout }),
    [workspaceSlug, projectId, updateFilters]
  );

  const handleDisplayFilters = useCallback(
    (displayFilters: Partial<IIssueDisplayFilterOptions>) =>
      void updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, displayFilters),
    [workspaceSlug, projectId, updateFilters]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) =>
      void updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_PROPERTIES, property),
    [workspaceSlug, projectId, updateFilters]
  );

  const copyLink = () =>
    void copyTextToClipboard(window.location.href).then(() =>
      setToast({ type: "success", title: t("common.link_copied"), compact: true })
    );

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        projectDetails={currentProjectDetails ?? undefined}
      />
      <header className="flex shrink-0 flex-col gap-2 px-[18px] pt-3">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {sidebarCollapsed && projectPreferences.navigationMode !== "TABBED" && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            {currentProjectDetails && (
              <Link
                href={`/${workspaceSlug}/projects/${projectId}/issues/`}
                className="flex min-w-0 items-center gap-1.5 hover:text-primary"
              >
                <ProjectBadge
                  name={currentProjectDetails.name}
                  seed={currentProjectDetails.id}
                  logo={currentProjectDetails.logo_props}
                />
                <span className="truncate">{currentProjectDetails.name}</span>
              </Link>
            )}
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-primary">{t("common.work_items")}</span>
          </nav>
          <span className="flex-1" />
          {currentProjectDetails?.anchor && (
            <a
              href={`${spaceAppUrl}/issues/${currentProjectDetails.anchor}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-6 items-center gap-1.5 rounded-md bg-accent-subtle px-2 text-11 font-medium text-accent-primary"
            >
              <span className="size-1.5 rounded-full bg-accent-primary" aria-hidden="true" />
              {t("workspace_projects.network.public.title")}
              <NewTabOutline className="hidden size-3 group-hover:block" />
            </a>
          )}
          <Tooltip label={t("copy_link")} side="bottom">
            <IconButton
              size="md"
              variant="ghost"
              icon={<Icon icon={LinkOutline} />}
              aria-label={t("copy_link")}
              onClick={copyLink}
            />
          </Tooltip>
          <Menu>
            <MenuTrigger
              render={
                <IconButton
                  size="md"
                  variant="ghost"
                  icon={<Icon icon={MoreHorizontalOutline} />}
                  aria-label={t("work_items_header.more_actions")}
                />
              }
            />
            <MenuContent side="bottom" align="end">
              <MenuItem
                icon={<Icon icon={BarOutline} />}
                label={t("common.analytics")}
                onClick={() => setAnalyticsModal(true)}
              />
            </MenuContent>
          </Menu>
        </div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">
            {t("common.work_items")}
          </h1>
          {count !== undefined && (
            <span className="rounded-[5px] bg-layer-2 px-[7px] text-12 leading-5 text-secondary">
              {t("work_items_header.items", { count })}
            </span>
          )}
        </div>
        <WorkItemsLayoutTabs
          activeLayout={activeLayout}
          onChange={handleLayoutChange}
          onCreateView={() => toggleCreateViewModal(true)}
        />
      </header>
      {projectId && (
        <WorkItemsPQLToolbar
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          trailing={
            <>
              {activeLayout === EIssueLayoutTypes.KANBAN && (
                <BoardSwimlanes
                  groupBy={issueFilters?.displayFilters?.group_by}
                  subGroupBy={issueFilters?.displayFilters?.sub_group_by}
                  onChange={(subGroupBy) => handleDisplayFilters({ sub_group_by: subGroupBy })}
                />
              )}
              <FiltersDropdown
                miniIcon={<PreferencesOutline className="size-3.5" />}
                title={t("common.display")}
                placement="bottom-end"
              >
                <DisplayFiltersSelection
                  layoutDisplayFiltersOptions={layoutDisplayFiltersOptions}
                  displayFilters={issueFilters?.displayFilters ?? {}}
                  handleDisplayFiltersUpdate={handleDisplayFilters}
                  displayProperties={issueFilters?.displayProperties ?? {}}
                  handleDisplayPropertiesUpdate={handleDisplayProperties}
                  cycleViewDisabled={!currentProjectDetails?.cycle_view}
                  moduleViewDisabled={!currentProjectDetails?.module_view}
                />
              </FiltersDropdown>
            </>
          }
        />
      )}
    </>
  );
});
