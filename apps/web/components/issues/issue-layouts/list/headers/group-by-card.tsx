/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AddOutline, ChevronDownOutline, ChevronRightOutline } from "@makeplane/propel/icons";
// types
import { setToast } from "@plane/blocks/toast";
import type { TIssue, ISearchIssueResponse, TIssueGroupByOptions } from "@plane/types";
import { useTranslation } from "@plane/i18n";
// ui
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
// components
import { cn } from "@plane/utils";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { MultipleSelectGroupAction } from "@/components/core/multiple-select";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { CreateUpdateEpicModal } from "@/components/epic-modal";
// constants
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// local imports
import { GroupLozenge } from "../../group-lozenge";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

interface IHeaderGroupByCard {
  groupID: string;
  groupBy: TIssueGroupByOptions;
  icon?: React.ReactNode;
  title: string;
  count: number;
  issuePayload: Partial<TIssue>;
  canEditProperties: (projectId: string | undefined) => boolean;
  disableIssueCreation?: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  selectionHelpers: TSelectionHelper;
  handleCollapsedGroups: (value: string) => void;
  isExpanded?: boolean;
  isEpic?: boolean;
}

export const HeaderGroupByCard = observer(function HeaderGroupByCard(props: IHeaderGroupByCard) {
  const {
    groupID,
    icon,
    title,
    count,
    issuePayload,
    canEditProperties,
    disableIssueCreation,
    addIssuesToView,
    selectionHelpers,
    handleCollapsedGroups,
    isExpanded = true,
    groupBy,
    isEpic = false,
  } = props;
  // plane hooks
  const { t } = useTranslation();
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [openExistingIssueListModal, setOpenExistingIssueListModal] = useState(false);
  // router
  const { workspaceSlug, projectId, moduleId, cycleId } = useParams();
  const storeType = useIssueStoreType();
  // derived values
  const renderExistingIssueModal = moduleId || cycleId;
  const existingIssuesListModalPayload = moduleId ? { module: moduleId.toString() } : { cycle: true };
  const isGroupSelectionEmpty = selectionHelpers.isGroupSelected(groupID) === "empty";
  // auth
  const canSelectIssues = canEditProperties(projectId?.toString()) && !selectionHelpers.isSelectionDisabled;

  const handleAddIssuesToView = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId) return;

    const issues = data.map((i) => i.id);

    try {
      await addIssuesToView?.(issues);

      setToast({
        type: "success",
        title: "Success!",
        message: "Work items added to the cycle successfully.",
      });
    } catch (_error) {
      setToast({
        type: "error",
        title: "Error!",
        message: "Selected work items could not be added to the cycle. Please try again.",
      });
    }
  };

  return (
    <>
      <div className="group/list-header flex h-full w-full flex-shrink-0 items-center gap-2">
        <span className="grid w-[18px] shrink-0 place-items-center">
          {canSelectIssues && (
            <MultipleSelectGroupAction
              className={cn(
                "pointer-events-none size-3.5 opacity-0 !outline-none group-hover/list-header:pointer-events-auto group-hover/list-header:opacity-100",
                {
                  "pointer-events-auto opacity-100": !isGroupSelectionEmpty,
                }
              )}
              groupID={groupID}
              selectionHelpers={selectionHelpers}
              disabled={count === 0}
            />
          )}
        </span>
        <button
          type="button"
          aria-label={t("work_items_list.collapse", { group: title })}
          aria-expanded={isExpanded}
          onClick={() => handleCollapsedGroups(groupID)}
          className="grid size-[22px] shrink-0 place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
        >
          {isExpanded ? <ChevronDownOutline className="size-3" /> : <ChevronRightOutline className="size-3" />}
        </button>
        <button type="button" onClick={() => handleCollapsedGroups(groupID)} className="flex min-w-0">
          <GroupLozenge groupBy={groupBy} groupId={groupID} icon={icon} title={title} />
        </button>
        <span className="text-13 text-secondary tabular-nums">{count || 0}</span>
        <span className="flex-1" />

        {!disableIssueCreation &&
          (renderExistingIssueModal ? (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("common.add")}
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                  >
                    <AddOutline className="size-4" />
                  </button>
                }
              />
              <MenuContent side="bottom" align="start">
                <MenuItem
                  label="Create work item"
                  onClick={() => {
                    setIsOpen(true);
                  }}
                />
                <MenuItem
                  label="Add an existing work item"
                  onClick={() => {
                    setOpenExistingIssueListModal(true);
                  }}
                />
              </MenuContent>
            </Menu>
          ) : (
            <button
              type="button"
              aria-label={t("common.add")}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
              onClick={() => {
                setIsOpen(true);
              }}
            >
              <AddOutline className="size-4" />
            </button>
          ))}

        {isEpic ? (
          <CreateUpdateEpicModal isOpen={isOpen} onClose={() => setIsOpen(false)} data={issuePayload} />
        ) : (
          <CreateUpdateIssueModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            data={issuePayload}
            storeType={storeType}
          />
        )}

        {renderExistingIssueModal && (
          <ExistingIssuesListModal
            workspaceSlug={workspaceSlug?.toString()}
            projectId={projectId?.toString()}
            isOpen={openExistingIssueListModal}
            handleClose={() => setOpenExistingIssueListModal(false)}
            searchParams={existingIssuesListModalPayload}
            handleOnSubmit={handleAddIssuesToView}
          />
        )}
      </div>
    </>
  );
});
