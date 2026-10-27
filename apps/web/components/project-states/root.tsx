/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// components
import { EUserPermissionsLevel } from "@plane/constants";
import type { IState, TStateOperationsCallbacks, TWorkspaceStateGroup } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
import { ProjectStateLoader, GroupList } from "@/components/project-states";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useStateGroup } from "@/hooks/store/use-state-group";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * A project's states by workspace state group (E30), in the workspace's group order with every group present. A state
 * not yet in a group sits in the built-in group of its category.
 */
const groupStates = (states: IState[], groups: TWorkspaceStateGroup[]) => {
  const grouped: Record<string, IState[]> = Object.fromEntries(groups.map((group) => [group.id, []]));
  for (const state of states) {
    const id =
      state.state_group && grouped[state.state_group]
        ? state.state_group
        : groups.find((group) => group.is_builtin && group.key === state.group)?.id;
    if (id) grouped[id].push(state);
  }
  return grouped;
};

type TProjectState = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectStateRoot = observer(function ProjectStateRoot(props: TProjectState) {
  const { workspaceSlug, projectId } = props;
  // hooks
  const {
    getProjectStates,
    fetchProjectStates,
    createState,
    moveStatePosition,
    updateState,
    deleteState,
    markStateAsDefault,
  } = useProjectState();
  const { getStateGroups, fetchStateGroups } = useStateGroup();
  const { getProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditable = allowPermissions(
    [EUserProjectRoles.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  // Fetching all project states
  useSWR(
    workspaceSlug && projectId ? `PROJECT_STATES_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectStates(workspaceSlug.toString(), projectId.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // the workspace's groups, asked again on each visit so a group added in workspace settings shows
  useSWR(
    workspaceSlug ? `WORKSPACE_STATE_GROUPS_${workspaceSlug}` : null,
    () => fetchStateGroups(workspaceSlug, true),
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );

  // State operations callbacks
  const stateOperationsCallbacks: TStateOperationsCallbacks = useMemo(
    () => ({
      createState: async (data: Partial<IState>) => createState(workspaceSlug, projectId, data),
      updateState: async (stateId: string, data: Partial<IState>) =>
        updateState(workspaceSlug, projectId, stateId, data),
      deleteState: async (stateId: string) => deleteState(workspaceSlug, projectId, stateId),
      moveStatePosition: async (stateId: string, data: Partial<IState>) =>
        moveStatePosition(workspaceSlug, projectId, stateId, data),
      markStateAsDefault: async (stateId: string) => markStateAsDefault(workspaceSlug, projectId, stateId),
    }),
    [workspaceSlug, projectId, createState, moveStatePosition, updateState, deleteState, markStateAsDefault]
  );

  const stateGroups = getStateGroups(workspaceSlug);
  const projectStates = getProjectStates(projectId);

  // Loader
  if (!stateGroups || !projectStates) return <ProjectStateLoader />;

  return (
    <GroupList
      groupedStates={groupStates(projectStates, stateGroups)}
      stateGroups={stateGroups}
      projectName={getProjectById(projectId)?.name ?? ""}
      stateOperationsCallbacks={stateOperationsCallbacks}
      isEditable={isEditable}
    />
  );
});
