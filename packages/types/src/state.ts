/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TStateGroups = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface IState {
  readonly id: string;
  color: string;
  default: boolean;
  description: string;
  group: TStateGroups;
  name: string;
  project_id: string;
  sequence: number;
  workspace_id: string;
  order: number;
  /** The workspace state group the state sits in (E30); its category is `group`. */
  state_group?: string | null;
}

export interface IStateLite {
  color: string;
  group: TStateGroups;
  id: string;
  name: string;
}

export interface IStateResponse {
  [key: string]: IState[];
}

export type TStateOperationsCallbacks = {
  createState: (data: Partial<IState>) => Promise<IState>;
  updateState: (stateId: string, data: Partial<IState>) => Promise<IState | undefined>;
  deleteState: (stateId: string) => Promise<void>;
  moveStatePosition: (stateId: string, data: Partial<IState>) => Promise<void>;
  markStateAsDefault: (stateId: string) => Promise<void>;
};

/**
 * One of a workspace's state groups (E30): the columns every board shares. Each sits in one of the five categories
 * that progress, cycles, archiving, analytics and PQL read; Review is built in and sits in started.
 */
export type TWorkspaceStateGroup = {
  id: string;
  name: string;
  /** The category a built-in group stands for (`review` for Review); null for a custom one. */
  key: string | null;
  category: TStateGroups;
  color: string;
  description: string;
  sequence: number;
  is_builtin: boolean;
  /** How many states and projects use it. */
  state_count: number | null;
  project_count: number | null;
  created_at: string;
  updated_at: string;
};

/** A state in a group across the workspace's projects: what deleting the group moves. */
export type TStateGroupState = {
  id: string;
  name: string;
  color: string;
  project: { id: string; name: string; identifier: string };
  issue_count: number;
};
