/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { Circle } from "lucide-react";
import { ChevronDownOutline, ChevronRightOutline } from "@makeplane/propel/icons";
// Plane
import type { TIssueGroupByOptions, TIssueKanbanFilters } from "@plane/types";
import { useTranslation } from "@plane/i18n";
// hooks
import { useMember } from "@/hooks/store/use-member";

interface IHeaderSubGroupByCard {
  icon?: React.ReactNode;
  title: string;
  count: number;
  column_id: string;
  collapsedGroups: TIssueKanbanFilters;
  sub_group_by: TIssueGroupByOptions | undefined;
  handleCollapsedGroups: (toggle: "group_by" | "sub_group_by", value: string) => void;
}

// A swimlane header in 3A: the chevron, the lane's icon, its name and count, and a BOT badge on a bot assignee
export const HeaderSubGroupByCard = observer(function HeaderSubGroupByCard(props: IHeaderSubGroupByCard) {
  const { icon, title, count, column_id, collapsedGroups, sub_group_by, handleCollapsedGroups } = props;
  // hooks
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  // derived values
  const isCollapsed = collapsedGroups?.sub_group_by.includes(column_id);
  const isBot = sub_group_by === "assignees" && !!getUserDetails(column_id)?.is_bot;

  return (
    <button
      type="button"
      aria-expanded={!isCollapsed}
      aria-label={t("work_items_list.collapse", { group: title })}
      className="relative flex h-[34px] w-full flex-shrink-0 cursor-pointer items-center gap-2 pl-2.5 text-13"
      onClick={() => handleCollapsedGroups("sub_group_by", column_id)}
    >
      {isCollapsed ? (
        <ChevronRightOutline className="size-3 flex-shrink-0 text-secondary" />
      ) : (
        <ChevronDownOutline className="size-3 flex-shrink-0 text-secondary" />
      )}
      <span className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-xs">
        {icon ? icon : <Circle width={14} strokeWidth={2} />}
      </span>
      <span className="line-clamp-1 font-semibold text-primary">{title}</span>
      <span className="text-secondary tabular-nums">{count || 0}</span>
      {isBot && (
        <span className="inline-flex h-4 items-center rounded-[5px] bg-loz-review-bg px-[5px] text-[9.5px] font-semibold tracking-[0.06em] text-loz-review-fg">
          BOT
        </span>
      )}
    </button>
  );
});
