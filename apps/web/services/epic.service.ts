/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TEpic,
  TEpicDetail,
  TEpicDetailFields,
  TEpicHealth,
  TEpicUpdate,
  TEpicWave,
  TIssue,
  TWorkspaceEpicStats,
  TWorkspaceEpicStatus,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/** Epics (E11): the lists in a project and across projects, one epic's page, its updates and the waves. */
export class EpicService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TEpic[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/epics/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listWorkspace(
    workspaceSlug: string,
    params: { status: TWorkspaceEpicStatus; project_ids?: string }
  ): Promise<{ stats: TWorkspaceEpicStats; results: TEpic[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/epics/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<TIssue> & TEpicDetailFields): Promise<TEpic> {
    return this.post(`${this.base(workspaceSlug, projectId)}/epics/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Turns a work item into an epic (its first assignee becomes the lead), or an epic back into a work item. */
  async convert(workspaceSlug: string, projectId: string, issueId: string, isEpic: boolean): Promise<TEpic | null> {
    return this.post(`${this.base(workspaceSlug, projectId)}/epics/convert/`, { issue_id: issueId, is_epic: isEpic })
      .then((response) => response?.data ?? null)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, epicId: string): Promise<TEpicDetail> {
    return this.get(`${this.base(workspaceSlug, projectId)}/epics/${epicId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateFields(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    data: TEpicDetailFields
  ): Promise<TEpic> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/epics/${epicId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listUpdates(workspaceSlug: string, projectId: string, epicId: string): Promise<TEpicUpdate[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/epics/${epicId}/updates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async postUpdate(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    data: { health: TEpicHealth; body: string }
  ): Promise<TEpicUpdate> {
    return this.post(`${this.base(workspaceSlug, projectId)}/epics/${epicId}/updates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listWaves(workspaceSlug: string, projectId: string): Promise<TEpicWave[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/epic-waves/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWave(
    workspaceSlug: string,
    projectId: string,
    data: Pick<TEpicWave, "code" | "name">
  ): Promise<TEpicWave> {
    return this.post(`${this.base(workspaceSlug, projectId)}/epic-waves/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWave(
    workspaceSlug: string,
    projectId: string,
    waveId: string,
    data: Partial<Pick<TEpicWave, "code" | "name" | "sort_order">>
  ): Promise<TEpicWave> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/epic-waves/${waveId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWave(workspaceSlug: string, projectId: string, waveId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/epic-waves/${waveId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
