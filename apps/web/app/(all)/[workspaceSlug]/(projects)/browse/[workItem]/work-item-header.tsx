/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRightOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { generateWorkItemLink } from "@plane/utils";
// components
import { IssueDetailQuickActions } from "@/components/issues/issue-detail/issue-detail-quick-actions";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";

/**
 * The detail page's top bar (4A): the path (project, the parent's ID when there is one, the item's ID) and the page's
 * actions on the right.
 */
export const WorkItemDetailsHeader = observer(function WorkItemDetailsHeader() {
  // router
  const { workspaceSlug: routeWorkspaceSlug, workItem } = useParams();
  const workspaceSlug = routeWorkspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { getProjectById, getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById, getIssueIdByIdentifier },
  } = useIssueDetail();
  // derived values
  const issueId = getIssueIdByIdentifier(workItem?.toString());
  const issueDetails = issueId ? getIssueById(issueId.toString()) : undefined;
  const projectId = issueDetails?.project_id ?? undefined;
  const projectDetails = projectId ? getProjectById(projectId) : undefined;
  const parent = issueDetails?.parent_id ? getIssueById(issueDetails.parent_id) : undefined;
  const parentIdentifier = parent?.project_id ? getProjectIdentifierById(parent.project_id) : undefined;

  if (!workspaceSlug || !projectId || !issueId || !issueDetails) return null;
  return (
    <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-[18px]">
      {sidebarCollapsed && projectPreferences.navigationMode !== "TABBED" && <AppSidebarToggleButton />}
      <nav
        aria-label={t("aria_labels.breadcrumb.trail")}
        className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
      >
        {projectDetails && (
          <Link href={`/${workspaceSlug}/projects/${projectId}/issues/`} className="truncate hover:text-primary">
            {projectDetails.name}
          </Link>
        )}
        {parent?.project_id && parentIdentifier && (
          <>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <Link
              href={generateWorkItemLink({
                workspaceSlug,
                projectId: parent.project_id,
                issueId: parent.id,
                projectIdentifier: parentIdentifier,
                sequenceId: parent.sequence_id,
                isEpic: parent.is_epic,
              })}
              className="max-w-60 truncate hover:text-primary"
            >
              {parent.name}
            </Link>
          </>
        )}
        <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
        <span aria-current="page" className="shrink-0">
          {projectDetails?.identifier}-{issueDetails.sequence_id}
        </span>
      </nav>
      <span className="flex-1" />
      <IssueDetailQuickActions workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} />
    </header>
  );
});
