/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import type { TStateGroupState, TWorkspaceStateGroup } from "@plane/types";
// services
import { StateGroupService } from "@/services/state-group.service";

export interface IStateGroupStore {
  /** The workspace's state groups by slug, in board order. */
  stateGroupsMap: Record<string, TWorkspaceStateGroup[]>;
  getStateGroups: (workspaceSlug: string) => TWorkspaceStateGroup[] | undefined;
  getStateGroupById: (workspaceSlug: string, id: string | null | undefined) => TWorkspaceStateGroup | undefined;
  /** Asks once per workspace, however many boards and pages want them at the same time. */
  fetchStateGroups: (workspaceSlug: string, force?: boolean) => Promise<TWorkspaceStateGroup[]>;
  createStateGroup: (workspaceSlug: string, data: Partial<TWorkspaceStateGroup>) => Promise<TWorkspaceStateGroup>;
  updateStateGroup: (
    workspaceSlug: string,
    id: string,
    data: Partial<TWorkspaceStateGroup>
  ) => Promise<TWorkspaceStateGroup>;
  /** The states a delete moves, across the workspace's projects; asked when the delete dialog opens. */
  fetchStateGroupStates: (workspaceSlug: string, id: string) => Promise<TStateGroupState[]>;
  deleteStateGroup: (workspaceSlug: string, id: string, moves: Record<string, string>) => Promise<void>;
}

/** A workspace's state groups (E30), for the settings page, the project states page and the board columns. */
export class StateGroupStore implements IStateGroupStore {
  stateGroupsMap: Record<string, TWorkspaceStateGroup[]> = {};
  private inFlight: Record<string, Promise<TWorkspaceStateGroup[]> | undefined> = {};
  private service = new StateGroupService();

  constructor() {
    makeObservable(this, {
      stateGroupsMap: observable,
      fetchStateGroups: action,
      createStateGroup: action,
      updateStateGroup: action,
      deleteStateGroup: action,
    });
  }

  getStateGroups = (workspaceSlug: string) => this.stateGroupsMap[workspaceSlug];

  getStateGroupById = (workspaceSlug: string, id: string | null | undefined) =>
    id ? this.stateGroupsMap[workspaceSlug]?.find((group) => group.id === id) : undefined;

  fetchStateGroups = (workspaceSlug: string, force = false) => {
    if (!force && this.stateGroupsMap[workspaceSlug]) return Promise.resolve(this.stateGroupsMap[workspaceSlug]);
    const pending = this.inFlight[workspaceSlug];
    if (pending) return pending;
    const request = this.service
      .list(workspaceSlug)
      .then((groups) => {
        runInAction(() => {
          this.stateGroupsMap[workspaceSlug] = groups;
        });
        return groups;
      })
      .finally(() => {
        this.inFlight[workspaceSlug] = undefined;
      });
    this.inFlight[workspaceSlug] = request;
    return request;
  };

  // a change can reorder the list and move counts, so the list is asked again after each
  createStateGroup = async (workspaceSlug: string, data: Partial<TWorkspaceStateGroup>) => {
    const group = await this.service.create(workspaceSlug, data);
    await this.fetchStateGroups(workspaceSlug, true);
    return group;
  };

  updateStateGroup = async (workspaceSlug: string, id: string, data: Partial<TWorkspaceStateGroup>) => {
    const group = await this.service.update(workspaceSlug, id, data);
    await this.fetchStateGroups(workspaceSlug, true);
    return group;
  };

  fetchStateGroupStates = (workspaceSlug: string, id: string) => this.service.states(workspaceSlug, id);

  deleteStateGroup = async (workspaceSlug: string, id: string, moves: Record<string, string>) => {
    await this.service.remove(workspaceSlug, id, moves);
    await this.fetchStateGroups(workspaceSlug, true);
  };
}
