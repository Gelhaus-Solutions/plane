/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { IState, TStateOperationsCallbacks, TWorkspaceStateGroup } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { GroupItem } from "@/components/project-states";

type TGroupList = {
  /** The project's states by workspace state group id. */
  groupedStates: Record<string, IState[]>;
  /** The workspace's state groups, in board order (E30). */
  stateGroups: TWorkspaceStateGroup[];
  projectName: string;
  stateOperationsCallbacks: TStateOperationsCallbacks;
  isEditable: boolean;
  groupListClassName?: string;
  groupItemClassName?: string;
  stateItemClassName?: string;
};

export const GroupList = observer(function GroupList(props: TGroupList) {
  const {
    groupedStates,
    stateGroups,
    projectName,
    stateOperationsCallbacks,
    isEditable,
    groupListClassName,
    groupItemClassName,
    stateItemClassName,
  } = props;
  // states: the groups folded away, so a group added later opens expanded
  const [collapsed, setCollapsed] = useState<string[]>([]);

  return (
    <div className={cn("space-y-5", groupListClassName)}>
      {stateGroups.map((group) => (
        <GroupItem
          key={group.id}
          group={group}
          states={groupedStates[group.id] ?? []}
          groupedStates={groupedStates}
          projectName={projectName}
          expanded={!collapsed.includes(group.id)}
          stateOperationsCallbacks={stateOperationsCallbacks}
          isEditable={isEditable}
          handleGroupCollapse={() => setCollapsed((prev) => (prev.includes(group.id) ? prev : [...prev, group.id]))}
          handleExpand={() => setCollapsed((prev) => prev.filter((id) => id !== group.id))}
          groupItemClassName={groupItemClassName}
          stateItemClassName={stateItemClassName}
        />
      ))}
    </div>
  );
});
