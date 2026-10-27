/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TWorkspacePriority } from "@plane/types";
import { APIService } from "@/services/api.service";

/** A workspace's priorities (E35): everyone reads them, admins edit them. */
export class PriorityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TWorkspacePriority[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/priorities/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TWorkspacePriority>): Promise<TWorkspacePriority> {
    return this.post(`/api/workspaces/${workspaceSlug}/priorities/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, id: string, data: Partial<TWorkspacePriority>): Promise<TWorkspacePriority> {
    return this.patch(`/api/workspaces/${workspaceSlug}/priorities/${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, id: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/priorities/${id}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
