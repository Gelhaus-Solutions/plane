/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane helpers
import {
  CalendarOutline,
  EpicOutline,
  MoreHorizontalOutline,
  ParentOutline,
  SubWorkItemsOutline,
} from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { useOutsideClickDetector } from "@plane/hooks";
// types
import { setToast } from "@plane/blocks/toast";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import type { TIssue, IIssueDisplayProperties, IIssueMap, TIssueGroupByOptions } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { ControlLink } from "@plane/blocks/layout";
import { DropIndicator } from "@plane/blocks/common";
import { cn, generateWorkItemLink, getDate, renderFormattedDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { HIGHLIGHT_CLASS, getIssueBlockId } from "@/components/issues/issue-layouts/utils";
import { AssigneeSelect } from "@/components/dropdowns/assignee/assignee-select";
import { PrioritySelect } from "@/components/dropdowns/priority/priority-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useKanbanView } from "@/hooks/store/use-kanban-view";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local components
import type { TRenderQuickActions } from "../list/list-view-types";
import { IssuePropertyLabels } from "../properties/labels";

interface IssueBlockProps {
  issueId: string;
  groupId: string;
  subGroupId: string;
  issuesMap: IIssueMap;
  displayProperties: IIssueDisplayProperties | undefined;
  draggableId: string;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  shouldRenderByDefault?: boolean;
  groupBy?: TIssueGroupByOptions;
  isEpic?: boolean;
}

interface IssueDetailsBlockProps {
  cardRef: React.RefObject<HTMLElement | null>;
  issue: TIssue;
  displayProperties: IIssueDisplayProperties | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  isReadOnly: boolean;
  groupBy?: TIssueGroupByOptions;
  isEpic?: boolean;
}

const KanbanIssueDetailsBlock = observer(function KanbanIssueDetailsBlock(props: IssueDetailsBlockProps) {
  const { cardRef, issue, updateIssue, quickActions, isReadOnly, displayProperties, groupBy, isEpic = false } = props;
  // refs
  const menuActionRef = useRef<HTMLButtonElement | null>(null);
  // states
  const [isMenuActive, setIsMenuActive] = useState(false);
  // hooks
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();
  const { getStateById } = useProjectState();
  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const projectIdentifier = getProjectIdentifierById(issue.project_id);

  const customActionButton = (
    // The quick-action menu grafts its trigger behaviour (and accessible name) onto this element via
    // MenuTrigger render, so it has to be a real button.
    <button
      type="button"
      ref={menuActionRef}
      className={`grid size-5 cursor-pointer place-items-center rounded-[5px] hover:bg-layer-transparent-hover ${
        isMenuActive ? "bg-layer-transparent-hover text-primary" : "text-secondary"
      }`}
      onClick={() => setIsMenuActive(!isMenuActive)}
    >
      <MoreHorizontalOutline className="h-3.5 w-3.5" />
    </button>
  );

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const handleEventPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  useOutsideClickDetector(menuActionRef, () => setIsMenuActive(false));

  const on = (key: keyof IIssueDisplayProperties) => displayProperties?.[key] ?? true;
  const stateDetails = issue.state_id ? getStateById(issue.state_id) : undefined;
  const parent = issue.parent_id ? getIssueById(issue.parent_id) : undefined;
  const dueDate = getDate(issue.target_date);
  const subIssuesCount = issue.sub_issues_count ?? 0;
  // a column already says which state its cards are in
  const showState = on("state") && groupBy !== "state" && groupBy !== "state_detail.group";
  const showFoot = !!parent || (subIssuesCount > 0 && on("sub_issue_count")) || (!!dueDate && on("due_date"));

  // The 3A card: ID and assignee, the title, priority and labels, then the parent, sub-items and due date
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center gap-1.5">
        {on("key") && (
          <span className="font-code text-[11.5px] text-secondary">
            {projectIdentifier}-{issue.sequence_id}
          </span>
        )}
        <span className="flex-1" />
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div
          className={cn({
            "hidden group-hover/kanban-block:block": !isMobile,
            "!block": isMenuActive,
          })}
          onClick={handleEventPropagation}
        >
          {quickActions({
            issue,
            parentRef: cardRef,
            customActionButton,
          })}
        </div>
        {on("assignee") && (
          // oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions
          <div className="flex" onClick={handleEventPropagation}>
            <AssigneeSelect
              issueId={issue.id}
              value={issue.assignee_ids ?? []}
              projectId={issue.project_id ?? ""}
              onChange={(ids) => void updateIssue?.(issue.project_id, issue.id, { assignee_ids: ids })}
              disabled={isReadOnly}
              variant={issue.assignee_ids?.length ? "avatar-group-sm" : "icon-sm"}
              tooltip={{ heading: t("work_items_list.assignee") }}
            />
          </div>
        )}
      </div>

      <Tooltip label={issue.name} layout="stacked" disabled={isMobile}>
        <div
          className={cn(
            "line-clamp-2 w-full text-13 leading-[1.38] font-medium",
            stateDetails?.group === "completed" ? "text-secondary" : "text-primary"
          )}
        >
          {issue.name}
        </div>
      </Tooltip>

      {(on("priority") || on("labels") || showState) && (
        // oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions
        <div className="flex flex-wrap items-center gap-1.5" onClick={handleEventPropagation}>
          {showState && (
            <StateSelect
              value={issue.state_id}
              projectId={issue.project_id ?? undefined}
              onChange={(val) => void updateIssue?.(issue.project_id, issue.id, { state_id: val })}
              disabled={isReadOnly}
              variant="icon-sm"
              tooltip
            />
          )}
          {on("priority") && (
            <PrioritySelect
              value={issue.priority}
              optionId={issue.priority_option_id}
              onChange={(val, optionId) =>
                void updateIssue?.(issue.project_id, issue.id, { priority: val, priority_option_id: optionId })
              }
              disabled={isReadOnly}
              variant="icon-sm"
              tooltip
            />
          )}
          {on("labels") && (issue.label_ids?.length ?? 0) > 0 && (
            <IssuePropertyLabels
              projectId={issue.project_id || null}
              value={issue.label_ids || []}
              onChange={(ids) => void updateIssue?.(issue.project_id, issue.id, { label_ids: ids })}
              disabled={isReadOnly}
              variant="select-ghost-md"
              placeholderText=""
              maxChips={2}
            />
          )}
        </div>
      )}

      {showFoot && (
        <div className="flex items-center gap-2 border-t border-subtle pt-[7px]">
          {parent && (
            <span className="flex h-[18px] max-w-36 min-w-0 items-center gap-[5px] rounded-[10px] bg-layer-2 px-[7px] text-11 text-secondary">
              {parent.is_epic ? (
                <EpicOutline className="size-2.5 shrink-0" aria-hidden="true" />
              ) : (
                <ParentOutline className="size-2.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{parent.name}</span>
            </span>
          )}
          {subIssuesCount > 0 && on("sub_issue_count") && (
            <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-secondary tabular-nums">
              <SubWorkItemsOutline className="size-3" aria-hidden="true" />
              {subIssuesCount}
            </span>
          )}
          <span className="flex-1" />
          {dueDate && on("due_date") && (
            <span
              className={cn("flex shrink-0 items-center gap-1 text-[11.5px] text-secondary", {
                "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
              })}
            >
              <CalendarOutline className="size-3" aria-hidden="true" />
              {renderFormattedDate(dueDate, "MMM d")}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export const KanbanIssueBlock = observer(function KanbanIssueBlock(props: IssueBlockProps) {
  const {
    issueId,
    groupId,
    subGroupId,
    issuesMap,
    displayProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    updateIssue,
    quickActions,
    canEditProperties,
    scrollableContainerRef,
    shouldRenderByDefault,
    groupBy,
    isEpic = false,
  } = props;

  const cardRef = useRef<HTMLAnchorElement | null>(null);
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // hooks
  const { getProjectIdentifierById } = useProject();
  const { getIsIssuePeeked } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);
  const { isMobile } = usePlatformOS();

  // handlers
  const handleIssuePeekOverview = (issue: TIssue) => handleRedirection(workspaceSlug, issue, isMobile);

  const issue = issuesMap[issueId];

  const { setIsDragging: setIsKanbanDragging } = useKanbanView();

  const [isDraggingOverBlock, setIsDraggingOverBlock] = useState(false);
  const [isCurrentBlockDragging, setIsCurrentBlockDragging] = useState(false);

  const canEditIssueProperties = canEditProperties(issue?.project_id ?? undefined);

  const isDragAllowed = canDragIssuesInCurrentGrouping && !issue?.tempId && canEditIssueProperties;
  const projectIdentifier = getProjectIdentifierById(issue?.project_id);

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issue?.sequence_id,
    isEpic,
    isArchived: !!issue?.archived_at,
  });

  useOutsideClickDetector(cardRef, () => {
    cardRef?.current?.classList?.remove(HIGHLIGHT_CLASS);
  });

  // Make Issue block both as as Draggable and,
  // as a DropTarget for other issues being dragged to get the location of drop
  useEffect(() => {
    const element = cardRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        dragHandle: element,
        canDrag: () => isDragAllowed,
        getInitialData: () => ({ id: issue?.id, type: "ISSUE" }),
        onDragStart: () => {
          setIsCurrentBlockDragging(true);
          setIsKanbanDragging(true);
        },
        onDrop: () => {
          setIsKanbanDragging(false);
          setIsCurrentBlockDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source?.data?.id !== issue?.id && canDropOverIssue,
        getData: () => ({ id: issue?.id, type: "ISSUE" }),
        onDragEnter: () => {
          setIsDraggingOverBlock(true);
        },
        onDragLeave: () => {
          setIsDraggingOverBlock(false);
        },
        onDrop: () => {
          setIsDraggingOverBlock(false);
        },
      })
    );
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
  }, [cardRef?.current, issue?.id, isDragAllowed, canDropOverIssue, setIsCurrentBlockDragging, setIsDraggingOverBlock]);

  if (!issue) return null;

  return (
    <>
      <DropIndicator isVisible={!isCurrentBlockDragging && isDraggingOverBlock} />
      <div
        id={`issue-${issueId}`}
        // make Z-index higher at the beginning of drag, to have a issue drag image of issue block without any overlaps
        className={cn("group/kanban-block relative mb-2", { "z-[1]": isCurrentBlockDragging })}
        onDragStart={() => {
          if (isDragAllowed) setIsCurrentBlockDragging(true);
          else {
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
        <ControlLink
          id={getIssueBlockId(issueId, groupId, subGroupId)}
          href={workItemLink}
          ref={cardRef}
          className={cn(
            "block w-full rounded-[10px] border border-strong bg-layer-1 px-[11px] py-2.5 text-13 shadow-e1 transition-[transform,box-shadow,border-color] duration-[140ms] hover:-translate-y-px hover:shadow-e2",
            { "hover:cursor-pointer": isDragAllowed },
            { "border border-accent-strong hover:border-accent-strong": getIsIssuePeeked(issue.id) },
            { "z-[100] bg-layer-1": isCurrentBlockDragging }
          )}
          onClick={() => handleIssuePeekOverview(issue)}
          disabled={!!issue?.tempId}
        >
          <RenderIfVisible
            classNames=""
            root={scrollableContainerRef}
            defaultHeight="100px"
            horizontalOffset={100}
            verticalOffset={200}
            defaultValue={shouldRenderByDefault}
          >
            <KanbanIssueDetailsBlock
              cardRef={cardRef}
              issue={issue}
              displayProperties={displayProperties}
              updateIssue={updateIssue}
              quickActions={quickActions}
              isReadOnly={!canEditIssueProperties}
              groupBy={groupBy}
              isEpic={isEpic}
            />
          </RenderIfVisible>
        </ControlLink>
      </div>
    </>
  );
});
