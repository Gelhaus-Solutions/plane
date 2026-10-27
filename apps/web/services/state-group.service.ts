/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TStateGroupState, TWorkspaceStateGroup } from "@plane/types";
import { APIService } from "@/services/api.service";

/** A workspace's state groups (E30): everyone reads them, admins edit them. */
export class StateGroupService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TWorkspaceStateGroup[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/state-groups/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TWorkspaceStateGroup>): Promise<TWorkspaceStateGroup> {
    return this.post(`/api/workspaces/${workspaceSlug}/state-groups/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, id: string, data: Partial<TWorkspaceStateGroup>): Promise<TWorkspaceStateGroup> {
    return this.patch(`/api/workspaces/${workspaceSlug}/state-groups/${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** The states a delete moves, across the workspace's projects. */
  async states(workspaceSlug: string, id: string): Promise<TStateGroupState[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/state-groups/${id}/states/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Deletes a custom group once each of its states moves to the group `moves` names for it. */
  async remove(workspaceSlug: string, id: string, moves: Record<string, string>): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/state-groups/${id}/`, { moves })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
