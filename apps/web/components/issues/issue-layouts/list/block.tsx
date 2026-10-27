/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ChevronRightOutline, ParentOutline, SubWorkItemsOutline } from "@makeplane/propel/icons";
// types
import { setToast } from "@plane/blocks/toast";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import type { TIssue, IIssueDisplayProperties, TIssueMap } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { ControlLink, Row } from "@plane/blocks/layout";
import { Spinner } from "@plane/blocks/spinner";
import { useTranslation } from "@plane/i18n";
import { DateSelect } from "@plane/blocks/property-select";
import {
  cn,
  generateWorkItemLink,
  getDate,
  renderFormattedPayloadDate,
  shouldHighlightIssueDueDate,
} from "@plane/utils";
// components
import { MultipleSelectEntityAction } from "@/components/core/multiple-select";
import { AssigneeSelect } from "@/components/dropdowns/assignee/assignee-select";
import { PrioritySelect } from "@/components/dropdowns/priority/priority-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
import { IssuePropertyLabels } from "@/components/issues/issue-layouts/properties/labels";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserProfile } from "@/hooks/store/user";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { getListColumns } from "./columns";
import type { TRenderQuickActions } from "./list-view-types";

interface IssueBlockProps {
  issueId: string;
  issuesMap: TIssueMap;
  groupId: string;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  displayProperties: IIssueDisplayProperties | undefined;
  canEditProperties: (projectId: string | undefined) => boolean;
  nestingLevel: number;
  spacingLeft?: number;
  isExpanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  selectionHelpers: TSelectionHelper;
  isCurrentBlockDragging: boolean;
  setIsCurrentBlockDragging: React.Dispatch<React.SetStateAction<boolean>>;
  canDrag: boolean;
  isEpic?: boolean;
}

/** Keeps a click on a cell's picker from reaching the row's link */
const swallow = (e: MouseEvent<HTMLElement>) => {
  e.preventDefault();
  e.stopPropagation();
};

export const IssueBlock = observer(function IssueBlock(props: IssueBlockProps) {
  const {
    issuesMap,
    issueId,
    groupId,
    updateIssue,
    quickActions,
    displayProperties,
    canEditProperties,
    nestingLevel,
    spacingLeft = 14,
    isExpanded,
    setExpanded,
    selectionHelpers,
    isCurrentBlockDragging,
    setIsCurrentBlockDragging,
    canDrag,
    isEpic = false,
  } = props;
  // ref
  const issueRef = useRef<HTMLDivElement | null>(null);
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  const projectId = routerProjectId?.toString();
  // hooks
  const { getProjectIdentifierById } = useProject();
  const {
    getIsIssuePeeked,
    peekIssue,
    setPeekIssue,
    subIssues: subIssuesStore,
    issue: { getIssueById },
  } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const { getStateById } = useProjectState();
  const { data: userProfile } = useUserProfile();
  const { t } = useTranslation();
  const columns = getListColumns(displayProperties);

  const handleIssuePeekOverview = (issue: TIssue) =>
    workspaceSlug &&
    issue &&
    issue.project_id &&
    issue.id &&
    !getIsIssuePeeked(issue.id) &&
    setPeekIssue({
      workspaceSlug,
      projectId: issue.project_id,
      issueId: issue.id,
      nestingLevel: nestingLevel,
      isArchived: !!issue.archived_at,
    });

  // derived values
  const issue = issuesMap[issueId];
  const subIssuesCount = issue?.sub_issues_count ?? 0;
  const canEditIssueProperties = canEditProperties(issue?.project_id ?? undefined);
  const isDraggingAllowed = canDrag && canEditIssueProperties;

  const { isMobile } = usePlatformOS();

  useEffect(() => {
    const element = issueRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        canDrag: () => isDraggingAllowed,
        getInitialData: () => ({ id: issueId, type: "ISSUE", groupId }),
        onDragStart: () => {
          setIsCurrentBlockDragging(true);
        },
        onDrop: () => {
          setIsCurrentBlockDragging(false);
        },
      })
    );
  }, [isDraggingAllowed, issueId, groupId, setIsCurrentBlockDragging]);

  if (!issue) return null;

  const projectIdentifier = getProjectIdentifierById(issue.project_id);
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issue.id);
  const isIssueActive = selectionHelpers.getIsEntityActive(issue.id);
  const isSubIssue = nestingLevel !== 0;
  const canSelectIssues = canEditIssueProperties && !selectionHelpers.isSelectionDisabled;

  const marginLeft = `${spacingLeft}px`;
  const stateDetails = issue.state_id ? getStateById(issue.state_id) : undefined;
  const isDone = stateDetails?.group === "completed";
  const parent = issue.parent_id ? getIssueById(issue.parent_id) : undefined;

  const handleToggleExpand = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (nestingLevel >= 3) {
      handleIssuePeekOverview(issue);
    } else {
      setExpanded((prevState) => {
        if (!prevState && workspaceSlug && issue && issue.project_id)
          subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issue.project_id, issue.id);
        return !prevState;
      });
    }
  };

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issue?.sequence_id,
    isEpic,
    isArchived: !!issue?.archived_at,
  });
  return (
    <ControlLink
      id={`issue-${issue.id}`}
      href={workItemLink}
      onClick={() => handleIssuePeekOverview(issue)}
      className="w-full cursor-pointer"
      disabled={!!issue?.tempId || issue?.is_draft}
    >
      <Row
        ref={issueRef}
        className={cn(
          "group/list-block relative grid h-9 items-center gap-x-2.5 border-b border-subtle bg-layer-transparent pr-[18px] pl-3 text-13 transition-colors duration-[120ms] hover:bg-layer-transparent-hover",
          {
            "bg-accent-row hover:bg-accent-row": getIsIssuePeeked(issue.id) && peekIssue?.nestingLevel === nestingLevel,
            "border-strong-1": isIssueActive,
            "bg-accent-primary/5 hover:bg-accent-primary/10": isIssueSelected,
            "bg-layer-1": isCurrentBlockDragging,
          }
        )}
        style={{ gridTemplateColumns: columns.template }}
        onDragStart={() => {
          if (!isDraggingAllowed) {
            setToast({
              type: "warning",
              title: "Cannot move work item",
              message: !canEditIssueProperties
                ? "You are not allowed to move this work item"
                : "Drag and drop is disabled for the current grouping",
            });
          }
        }}
      >
        {/* select */}
        <span className="grid place-items-center">
          {projectId && canSelectIssues && !isEpic && (
            <Tooltip
              label="Only work items within the current project can be selected."
              layout="stacked"
              disabled={issue.project_id === projectId}
            >
              <span className="grid place-items-center">
                <MultipleSelectEntityAction
                  className={cn(
                    "pointer-events-none opacity-0 transition-opacity group-hover/list-block:pointer-events-auto group-hover/list-block:opacity-100",
                    { "pointer-events-auto opacity-100": isIssueSelected }
                  )}
                  groupId={groupId}
                  id={issue.id}
                  selectionHelpers={selectionHelpers}
                  disabled={issue.project_id !== projectId}
                />
              </span>
            </Tooltip>
          )}
        </span>
        {/* priority */}
        {columns.priority && (
          <span role="presentation" className="grid place-items-center" onClick={swallow}>
            <PrioritySelect
              value={issue.priority}
              optionId={issue.priority_option_id}
              onChange={(val, optionId) =>
                void updateIssue?.(issue.project_id, issue.id, { priority: val, priority_option_id: optionId })
              }
              disabled={!canEditIssueProperties}
              variant="icon-sm"
              tooltip
            />
          </span>
        )}
        {/* ID */}
        {columns.id && (
          <span className="truncate font-code text-12 text-secondary">
            {projectIdentifier}-{issue.sequence_id}
          </span>
        )}
        {/* title: nesting, state, title, sub-items, parent, row actions */}
        <span className="flex min-w-0 items-center gap-2" style={isSubIssue ? { paddingLeft: marginLeft } : undefined}>
          {(subIssuesCount > 0 || isSubIssue) && (
            <span className="grid size-4 shrink-0 place-items-center">
              {subIssuesCount > 0 && !isEpic && (
                <button
                  type="button"
                  aria-label={t("work_item_detail.show_sub_items")}
                  aria-expanded={isExpanded}
                  className="grid size-4 place-items-center rounded-xs text-tertiary hover:text-secondary"
                  onClick={handleToggleExpand}
                >
                  <ChevronRightOutline className={cn("size-3.5 transition-transform", { "rotate-90": isExpanded })} />
                </button>
              )}
            </span>
          )}
          {(displayProperties?.state ?? true) && (
            <span role="presentation" className="flex shrink-0" onClick={swallow}>
              <StateSelect
                value={issue.state_id}
                projectId={issue.project_id ?? undefined}
                onChange={(val) => void updateIssue?.(issue.project_id, issue.id, { state_id: val })}
                disabled={!canEditIssueProperties}
                variant="icon-sm"
                tooltip
              />
            </span>
          )}
          <Tooltip label={issue.name} layout="stacked" align="start" disabled={isCurrentBlockDragging || isMobile}>
            <span className={cn("min-w-0 truncate font-medium", isDone ? "text-secondary" : "text-primary")}>
              {issue.name}
            </span>
          </Tooltip>
          {subIssuesCount > 0 && (displayProperties?.sub_issue_count ?? true) && (
            <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-secondary tabular-nums">
              <SubWorkItemsOutline className="size-3" aria-hidden="true" />
              {subIssuesCount}
            </span>
          )}
          {parent && !isSubIssue && (
            <span className="hidden h-5 max-w-40 min-w-0 shrink items-center gap-[5px] rounded-[10px] bg-layer-2 px-[7px] text-[11.5px] text-secondary sm:flex">
              <ParentOutline className="size-2.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{parent.name}</span>
            </span>
          )}
          {issue?.tempId !== undefined ? (
            <Spinner className="ml-auto size-4 shrink-0" />
          ) : (
            <span
              role="presentation"
              className="ml-auto flex shrink-0 opacity-0 transition-opacity group-focus-within/list-block:opacity-100 group-hover/list-block:opacity-100"
              onClick={swallow}
            >
              {quickActions({
                issue,
                parentRef: issueRef,
              })}
            </span>
          )}
        </span>
        {/* labels */}
        {columns.labels && (
          <span className="flex min-w-0 overflow-hidden">
            <IssuePropertyLabels
              projectId={issue.project_id || null}
              value={issue.label_ids || []}
              onChange={(ids) => void updateIssue?.(issue.project_id, issue.id, { label_ids: ids })}
              disabled={!canEditIssueProperties}
              variant="select-ghost-md"
              placeholderText=""
              maxChips={1}
            />
          </span>
        )}
        {/* assignee */}
        {columns.assignee && (
          <span role="presentation" className="flex min-w-0" onClick={swallow}>
            <AssigneeSelect
              issueId={issue.id}
              value={issue.assignee_ids ?? []}
              projectId={issue.project_id ?? ""}
              onChange={(ids) => void updateIssue?.(issue.project_id, issue.id, { assignee_ids: ids })}
              disabled={!canEditIssueProperties}
              variant="select-ghost-md"
              placeholder={t("work_items_list.unassigned")}
              tooltip={{ heading: t("work_items_list.assignee") }}
            />
          </span>
        )}
        {/* due */}
        {columns.due && (
          <span role="presentation" className="flex justify-end" onClick={swallow}>
            <DateSelect
              value={getDate(issue.target_date) ?? null}
              onChange={(date) =>
                void updateIssue?.(issue.project_id, issue.id, {
                  target_date: date ? renderFormattedPayloadDate(date) : null,
                })
              }
              minDate={getDate(issue.start_date) ?? undefined}
              disabled={!canEditIssueProperties}
              clearable
              placeholder=""
              formatToken="MMM d"
              weekStartsOn={userProfile?.start_of_the_week}
              variant="select-ghost-md"
              className={cn("w-auto text-12 text-secondary", {
                "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
              })}
            />
          </span>
        )}
      </Row>
    </ControlLink>
  );
});
