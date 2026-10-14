/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { CircleDashed } from "lucide-react";
// plane imports
import type { TIssueGroupByOptions } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";

/** The lozenge colours per state group; review is a started state in a Review group, so it falls under started */
const LOZENGE: Record<string, string> = {
  backlog: "bg-loz-backlog-bg text-loz-backlog-fg",
  unstarted: "bg-loz-unstarted-bg text-loz-unstarted-fg",
  started: "bg-loz-started-bg text-loz-started-fg",
  completed: "bg-loz-completed-bg text-loz-completed-fg",
  cancelled: "bg-loz-cancelled-bg text-loz-cancelled-fg",
};

type Props = {
  groupBy: TIssueGroupByOptions | undefined;
  groupId: string;
  icon?: ReactNode;
  title: string;
  className?: string;
};

/**
 * A group's name as an uppercase lozenge (2A group headers, 3A column headers): coloured by state group when the
 * grouping is by state, neutral otherwise.
 */
export const GroupLozenge = observer(function GroupLozenge(props: Props) {
  const { groupBy, groupId, icon, title, className } = props;
  const { getStateById } = useProjectState();
  const stateGroup =
    groupBy === "state" ? getStateById(groupId)?.group : groupBy === "state_detail.group" ? groupId : undefined;

  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-0 items-center gap-1.5 rounded-md pr-[7px] pl-[5px] text-11 font-semibold tracking-[0.02em] whitespace-nowrap uppercase",
        (stateGroup && LOZENGE[stateGroup]) || "bg-layer-2 text-secondary",
        className
      )}
    >
      <span className="grid size-3 shrink-0 place-items-center overflow-hidden [&_svg]:size-3">
        {icon ?? <CircleDashed className="size-3" strokeWidth={2} />}
      </span>
      <span className="truncate">{title}</span>
    </span>
  );
});
