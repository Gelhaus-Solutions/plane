/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AddOutline, ChevronRightOutline, MoreHorizontalOutline } from "@makeplane/propel/icons";
import { setToast } from "@plane/blocks/toast";
import type { TIssue, ISearchIssueResponse, TIssueKanbanFilters, TIssueGroupByOptions } from "@plane/types";
import { useTranslation } from "@plane/i18n";
// ui
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// constants
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { CreateUpdateEpicModal } from "@/components/epic-modal";
// local imports
import { GroupLozenge } from "../../group-lozenge";

interface IHeaderGroupByCard {
  sub_group_by: TIssueGroupByOptions | undefined;
  group_by: TIssueGroupByOptions | undefined;
  column_id: string;
  icon?: React.ReactNode;
  title: string;
  count: number;
  collapsedGroups: TIssueKanbanFilters;
  handleCollapsedGroups: (toggle: "group_by" | "sub_group_by", value: string) => void;
  issuePayload: Partial<TIssue>;
  disableIssueCreation?: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  isEpic?: boolean;
}

export const HeaderGroupByCard = observer(function HeaderGroupByCard(props: IHeaderGroupByCard) {
  const {
    sub_group_by,
    group_by,
    column_id,
    icon,
    title,
    count,
    collapsedGroups,
    handleCollapsedGroups,
    issuePayload,
    disableIssueCreation,
    addIssuesToView,
    isEpic = false,
  } = props;
  // plane hooks
  const { t } = useTranslation();
  const verticalAlignPosition = sub_group_by ? false : collapsedGroups?.group_by.includes(column_id);
  // states
  const [isOpen, setIsOpen] = React.useState(false);
  const [openExistingIssueListModal, setOpenExistingIssueListModal] = React.useState(false);
  // hooks
  const storeType = useIssueStoreType();
  // router
  const { workspaceSlug, projectId, moduleId, cycleId } = useParams();

  const renderExistingIssueModal = moduleId || cycleId;
  const ExistingIssuesListModalPayload = moduleId ? { module: moduleId.toString() } : { cycle: true };

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
          searchParams={ExistingIssuesListModalPayload}
          handleOnSubmit={handleAddIssuesToView}
        />
      )}
      {verticalAlignPosition ? (
        // a collapsed column is a narrow strip with its name running down (3A's Backlog strip)
        <button
          type="button"
          aria-label={t("work_items_list.collapse", { group: title })}
          aria-expanded={false}
          onClick={() => handleCollapsedGroups("group_by", column_id)}
          className="flex w-11 flex-shrink-0 flex-col items-center gap-2 rounded-lg py-2.5 text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
        >
          <ChevronRightOutline className="size-3" />
          <span className="grid size-3 place-items-center overflow-hidden [&_svg]:size-3">{icon}</span>
          <span className="text-11 font-semibold tracking-[0.08em] whitespace-nowrap uppercase [writing-mode:vertical-lr]">
            {title} · {count || 0}
          </span>
        </button>
      ) : (
        <div className="relative flex w-full flex-shrink-0 flex-row items-center gap-2 px-2 pt-2 pb-1.5">
          <GroupLozenge groupBy={group_by} groupId={column_id} icon={icon} title={title} />
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
                      className="grid size-6 flex-shrink-0 cursor-pointer place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                    >
                      <AddOutline className="size-3.5" />
                    </button>
                  }
                />
                <MenuContent side="bottom" align="end">
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
                className="grid size-6 flex-shrink-0 cursor-pointer place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                onClick={() => {
                  setIsOpen(true);
                }}
              >
                <AddOutline className="size-3.5" />
              </button>
            ))}
          {sub_group_by === null && (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("work_items_list.column_options", { group: title })}
                    className="grid size-6 flex-shrink-0 cursor-pointer place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                  >
                    <MoreHorizontalOutline className="size-3.5" />
                  </button>
                }
              />
              <MenuContent side="bottom" align="end">
                <MenuItem
                  label={t("work_items_list.collapse_column")}
                  onClick={() => handleCollapsedGroups("group_by", column_id)}
                />
              </MenuContent>
            </Menu>
          )}
        </div>
      )}
    </>
  );
});
