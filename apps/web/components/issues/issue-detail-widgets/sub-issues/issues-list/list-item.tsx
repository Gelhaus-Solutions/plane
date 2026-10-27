/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SyntheticEvent } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import {
  ChevronRightOutline,
  CloseOutline,
  DeleteOutline,
  EditOutline,
  LinkOutline,
  MoreHorizontalOutline,
} from "@makeplane/propel/icons";
// plane imports
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import type { TIssue, TIssueServiceType, TSubIssueOperations } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
import { ControlLink } from "@plane/blocks/layout";
import { cn, generateWorkItemLink } from "@plane/utils";
// helpers
import { useSubIssueOperations } from "@/components/issues/issue-detail-widgets/sub-issues/helper";
import { AssigneeSelect } from "@/components/dropdowns/assignee/assignee-select";
import { PrioritySelect } from "@/components/dropdowns/priority/priority-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local components
import { SubIssuesListRoot } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  rootIssueId: string;
  spacingLeft: number;
  canEdit: boolean;
  handleIssueCrudState: (
    key: "create" | "existing" | "update" | "delete",
    issueId: string,
    issue?: TIssue | null
  ) => void;
  subIssueOperations: TSubIssueOperations;
  issueId: string;
  issueServiceType?: TIssueServiceType;
  storeType?: EIssuesStoreType;
};

export const SubIssuesListItem = observer(function SubIssuesListItem(props: Props) {
  const {
    workspaceSlug,
    projectId,
    parentIssueId,
    rootIssueId,
    issueId,
    spacingLeft = 10,
    canEdit,
    handleIssueCrudState,
    subIssueOperations,
    issueServiceType = EIssueServiceType.ISSUES,
    storeType = EIssuesStoreType.PROJECT,
  } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail(issueServiceType);
  const {
    subIssues: { subIssueHelpersByIssueId, setSubIssueHelpers },
  } = useIssueDetail();
  const { fetchSubIssues } = useSubIssueOperations(EIssueServiceType.ISSUES);
  const { toggleCreateIssueModal, toggleDeleteIssueModal } = useIssueDetail(issueServiceType);
  const project = useProject();
  const { getStateById } = useProjectState();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  const issue = getIssueById(issueId);

  // derived values
  const projectDetail = (issue && issue.project_id && project.getProjectById(issue.project_id)) || undefined;

  const subIssueHelpers = subIssueHelpersByIssueId(parentIssueId);
  const subIssueCount = issue?.sub_issues_count ?? 0;
  const isDone = getStateById(issue?.state_id)?.group === "completed";

  //
  const handleIssuePeekOverview = (item: TIssue) => handleRedirection(workspaceSlug, item, isMobile);

  if (!issue) return <></>;

  const toggleChildren = async (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!subIssueHelpers.issue_visibility.includes(issueId)) {
      setSubIssueHelpers(parentIssueId, "preview_loader", issueId);
      await fetchSubIssues(workspaceSlug, projectId, issueId);
      setSubIssueHelpers(parentIssueId, "preview_loader", issueId);
    }
    setSubIssueHelpers(parentIssueId, "issue_visibility", issueId);
  };

  // check if current issue is the root issue
  const isCurrentIssueRoot = issueId === rootIssueId;

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId: issue?.id,
    projectIdentifier: projectDetail?.identifier,
    sequenceId: issue?.sequence_id,
  });

  return (
    <div key={issueId}>
      <ControlLink
        id={`issue-${issue.id}`}
        href={workItemLink}
        onClick={() => handleIssuePeekOverview(issue)}
        className="w-full cursor-pointer"
      >
        {issue && (
          <div
            className="group relative flex h-[34px] w-full items-center gap-[9px] border-b border-subtle pr-2.5 text-13 transition-colors duration-[120ms] hover:bg-layer-transparent-hover"
            style={{ paddingLeft: `${spacingLeft}px` }}
          >
            <div className="-ml-1 flex size-4 flex-shrink-0 items-center justify-center empty:hidden">
              {/* disable the chevron when current issue is also the root issue*/}
              {subIssueCount > 0 && !isCurrentIssueRoot && (
                <>
                  {subIssueHelpers.preview_loader.includes(issue.id) ? (
                    <div className="flex h-full w-full cursor-not-allowed items-center justify-center rounded-xs bg-layer-1 transition-all">
                      <LinkOutline width={14} height={14} className="animate-spin" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("work_item_detail.show_sub_items")}
                      aria-expanded={subIssueHelpers.issue_visibility.includes(issue.id)}
                      className="flex h-full w-full cursor-pointer items-center justify-center text-placeholder hover:text-tertiary"
                      onClick={(e) => void toggleChildren(e)}
                    >
                      <ChevronRightOutline
                        className={cn("size-3.5 transition-all", {
                          "rotate-90": subIssueHelpers.issue_visibility.includes(issue.id),
                        })}
                      />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* The row's ControlLink activates on click, so the pickers' own activation must not reach it */}
            <div
              role="presentation"
              className="flex shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <StateSelect
                value={issue.state_id}
                projectId={issue.project_id ?? undefined}
                onChange={(val) =>
                  issue.project_id &&
                  subIssueOperations.updateSubIssue(
                    workspaceSlug,
                    issue.project_id,
                    parentIssueId,
                    issueId,
                    { state_id: val },
                    { ...issue }
                  )
                }
                disabled={!canEdit}
                variant="icon-sm"
                tooltip
              />
            </div>
            <span className="w-[66px] shrink-0 truncate font-code text-[11.5px] text-secondary">
              {projectDetail?.identifier}-{issue.sequence_id}
            </span>
            <Tooltip label={issue.name} layout="stacked" disabled={isMobile}>
              <span className={cn("min-w-0 flex-1 truncate", isDone ? "text-secondary" : "text-primary")}>
                {issue.name}
              </span>
            </Tooltip>
            <div
              role="presentation"
              className="flex shrink-0 items-center gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <PrioritySelect
                value={issue.priority}
                optionId={issue.priority_option_id}
                onChange={(val, optionId) =>
                  issue.project_id &&
                  subIssueOperations.updateSubIssue(workspaceSlug, issue.project_id, parentIssueId, issueId, {
                    priority: val,
                    priority_option_id: optionId,
                  })
                }
                disabled={!canEdit}
                variant="icon-sm"
                tooltip
              />
              <AssigneeSelect
                issueId={issue.id}
                value={issue.assignee_ids ?? []}
                projectId={issue.project_id ?? ""}
                onChange={(val) =>
                  issue.project_id &&
                  subIssueOperations.updateSubIssue(workspaceSlug, issue.project_id, parentIssueId, issueId, {
                    assignee_ids: val,
                  })
                }
                disabled={!canEdit}
                variant={issue.assignee_ids?.length ? "avatar-group-sm" : "icon-sm"}
                tooltip
              />
            </div>
            {/* The row's ControlLink activates on click and on Enter/Space, so the menu's own
                activation must not reach it. */}
            <div
              role="presentation"
              className="flex-shrink-0 text-13 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.stopPropagation();
              }}
            >
              <Menu>
                <MenuTrigger
                  render={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={t("aria_labels.common.more_actions")}
                      icon={<Icon icon={MoreHorizontalOutline} />}
                    />
                  }
                />
                <MenuContent side="bottom" align="end">
                  {canEdit && (
                    <MenuItem
                      icon={<Icon icon={EditOutline} />}
                      label={t("issue.edit")}
                      onClick={() => {
                        handleIssueCrudState("update", parentIssueId, { ...issue });
                        toggleCreateIssueModal(true);
                      }}
                    />
                  )}
                  <MenuItem
                    icon={<Icon icon={LinkOutline} />}
                    label={t("issue.copy_link")}
                    onClick={() => {
                      subIssueOperations.copyLink(workItemLink);
                    }}
                  />
                  {canEdit && (
                    <MenuItem
                      icon={<Icon icon={CloseOutline} />}
                      label={
                        issueServiceType === EIssueServiceType.ISSUES
                          ? t("issue.remove.parent.label")
                          : t("issue.remove.label")
                      }
                      onClick={() => {
                        if (issue.project_id)
                          subIssueOperations.removeSubIssue(workspaceSlug, issue.project_id, parentIssueId, issue.id);
                      }}
                    />
                  )}
                  {canEdit && (
                    <MenuItem
                      icon={<Icon icon={DeleteOutline} />}
                      label={t("issue.delete.label")}
                      onClick={() => {
                        handleIssueCrudState("delete", parentIssueId, issue);
                        toggleDeleteIssueModal(issue.id);
                      }}
                    />
                  )}
                </MenuContent>
              </Menu>
            </div>
          </div>
        )}
      </ControlLink>

      {/* should not expand the current issue if it is also the root issue*/}
      {subIssueHelpers.issue_visibility.includes(issueId) &&
        issue.project_id &&
        subIssueCount > 0 &&
        !isCurrentIssueRoot && (
          <SubIssuesListRoot
            storeType={storeType}
            workspaceSlug={workspaceSlug}
            projectId={issue.project_id}
            parentIssueId={issue.id}
            rootIssueId={rootIssueId}
            spacingLeft={spacingLeft + 22}
            canEdit={canEdit}
            handleIssueCrudState={handleIssueCrudState}
            subIssueOperations={subIssueOperations}
          />
        )}
    </div>
  );
});
