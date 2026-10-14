/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
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
import { EpicService } from "@/services/epic.service";

export interface IEpicStore {
  epicMap: Record<string, TEpic>;
  detailMap: Record<string, TEpicDetail>;
  projectEpicIds: Record<string, string[]>;
  wavesByProject: Record<string, TEpicWave[]>;
  updatesByEpic: Record<string, TEpicUpdate[]>;
  workspaceEpicIds: string[] | undefined;
  workspaceStats: TWorkspaceEpicStats | undefined;
  // computed functions
  getEpicById: (epicId: string) => TEpic | undefined;
  getProjectEpics: (projectId: string) => TEpic[] | undefined;
  getProjectWaves: (projectId: string) => TEpicWave[] | undefined;
  getWaveById: (projectId: string, waveId: string | null | undefined) => TEpicWave | undefined;
  // actions
  fetchProjectEpics: (workspaceSlug: string, projectId: string) => Promise<TEpic[]>;
  fetchWorkspaceEpics: (workspaceSlug: string, status: TWorkspaceEpicStatus, projectIds?: string[]) => Promise<void>;
  fetchEpicDetail: (workspaceSlug: string, projectId: string, epicId: string) => Promise<TEpicDetail>;
  fetchWaves: (workspaceSlug: string, projectId: string) => Promise<TEpicWave[]>;
  createWave: (workspaceSlug: string, projectId: string, data: Pick<TEpicWave, "code" | "name">) => Promise<TEpicWave>;
  updateWave: (
    workspaceSlug: string,
    projectId: string,
    waveId: string,
    data: Partial<Pick<TEpicWave, "code" | "name" | "sort_order">>
  ) => Promise<TEpicWave>;
  deleteWave: (workspaceSlug: string, projectId: string, waveId: string) => Promise<void>;
  createEpic: (workspaceSlug: string, projectId: string, data: Partial<TIssue> & TEpicDetailFields) => Promise<TEpic>;
  convert: (workspaceSlug: string, projectId: string, issueId: string, isEpic: boolean) => Promise<TEpic | null>;
  updateEpicFields: (
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    data: TEpicDetailFields
  ) => Promise<TEpic>;
  fetchUpdates: (workspaceSlug: string, projectId: string, epicId: string) => Promise<TEpicUpdate[]>;
  postUpdate: (
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    data: { health: TEpicHealth; body: string }
  ) => Promise<TEpicUpdate>;
}

// oxlint-disable-next-line unicorn/no-array-sort
const sorted = (waves: TEpicWave[]) => [...waves].sort((a, b) => a.sort_order - b.sort_order);

/** Epics (E11): the rows of both lists, one epic's page, its updates and the project's waves. */
export class EpicStore implements IEpicStore {
  epicMap: Record<string, TEpic> = {};
  detailMap: Record<string, TEpicDetail> = {};
  projectEpicIds: Record<string, string[]> = {};
  wavesByProject: Record<string, TEpicWave[]> = {};
  updatesByEpic: Record<string, TEpicUpdate[]> = {};
  workspaceEpicIds: string[] | undefined = undefined;
  workspaceStats: TWorkspaceEpicStats | undefined = undefined;

  service = new EpicService();

  constructor() {
    makeObservable(this, {
      epicMap: observable,
      detailMap: observable,
      projectEpicIds: observable,
      wavesByProject: observable,
      updatesByEpic: observable,
      workspaceEpicIds: observable,
      workspaceStats: observable,
      fetchProjectEpics: action,
      fetchWorkspaceEpics: action,
      fetchEpicDetail: action,
      fetchWaves: action,
      createWave: action,
      updateWave: action,
      deleteWave: action,
      createEpic: action,
      convert: action,
      updateEpicFields: action,
      fetchUpdates: action,
      postUpdate: action,
    });
  }

  getEpicById = computedFn((epicId: string) => this.epicMap[epicId]);

  getProjectEpics = computedFn((projectId: string) => {
    const ids = this.projectEpicIds[projectId];
    if (!ids) return undefined;
    return ids.map((id) => this.epicMap[id]).filter((epic): epic is TEpic => !!epic);
  });

  getProjectWaves = computedFn((projectId: string) => this.wavesByProject[projectId]);

  getWaveById = computedFn((projectId: string, waveId: string | null | undefined) =>
    waveId ? this.wavesByProject[projectId]?.find((wave) => wave.id === waveId) : undefined
  );

  private putEpics(epics: TEpic[]) {
    for (const epic of epics) this.epicMap[epic.id] = epic;
  }

  /** A changed row is also the head of a loaded page, so both lists and the page agree. */
  private putEpic(epic: TEpic) {
    this.epicMap[epic.id] = epic;
    const detail = this.detailMap[epic.id];
    if (detail) this.detailMap[epic.id] = { ...detail, ...epic };
  }

  fetchProjectEpics = async (workspaceSlug: string, projectId: string) => {
    const epics = await this.service.list(workspaceSlug, projectId);
    runInAction(() => {
      this.putEpics(epics);
      this.projectEpicIds[projectId] = epics.map((epic) => epic.id);
    });
    return epics;
  };

  fetchWorkspaceEpics = async (workspaceSlug: string, status: TWorkspaceEpicStatus, projectIds?: string[]) => {
    const response = await this.service.listWorkspace(workspaceSlug, {
      status,
      ...(projectIds?.length ? { project_ids: projectIds.join(",") } : {}),
    });
    runInAction(() => {
      this.putEpics(response.results);
      this.workspaceEpicIds = response.results.map((epic) => epic.id);
      this.workspaceStats = response.stats;
    });
  };

  fetchEpicDetail = async (workspaceSlug: string, projectId: string, epicId: string) => {
    const detail = await this.service.retrieve(workspaceSlug, projectId, epicId);
    runInAction(() => {
      this.detailMap[epicId] = detail;
      this.epicMap[epicId] = detail;
    });
    return detail;
  };

  fetchWaves = async (workspaceSlug: string, projectId: string) => {
    const waves = await this.service.listWaves(workspaceSlug, projectId);
    runInAction(() => {
      this.wavesByProject[projectId] = waves;
    });
    return waves;
  };

  createWave = async (workspaceSlug: string, projectId: string, data: Pick<TEpicWave, "code" | "name">) => {
    const wave = await this.service.createWave(workspaceSlug, projectId, data);
    runInAction(() => {
      // oxlint-disable-next-line unicorn/no-array-sort
      this.wavesByProject[projectId] = [...(this.wavesByProject[projectId] ?? []), wave].sort(
        (a, b) => a.sort_order - b.sort_order
      );
    });
    return wave;
  };

  /** Renames or reorders a wave at once and puts it back if the server refuses. */
  updateWave = async (
    workspaceSlug: string,
    projectId: string,
    waveId: string,
    data: Partial<Pick<TEpicWave, "code" | "name" | "sort_order">>
  ) => {
    const before = this.wavesByProject[projectId] ?? [];
    runInAction(() => {
      this.wavesByProject[projectId] = sorted(before.map((wave) => (wave.id === waveId ? { ...wave, ...data } : wave)));
    });
    try {
      const wave = await this.service.updateWave(workspaceSlug, projectId, waveId, data);
      runInAction(() => {
        this.wavesByProject[projectId] = sorted(
          (this.wavesByProject[projectId] ?? []).map((item) => (item.id === waveId ? wave : item))
        );
      });
      return wave;
    } catch (error) {
      runInAction(() => {
        this.wavesByProject[projectId] = before;
      });
      throw error;
    }
  };

  /** Deletes a wave; its epics keep no wave. */
  deleteWave = async (workspaceSlug: string, projectId: string, waveId: string) => {
    const before = this.wavesByProject[projectId] ?? [];
    runInAction(() => {
      this.wavesByProject[projectId] = before.filter((wave) => wave.id !== waveId);
    });
    try {
      await this.service.deleteWave(workspaceSlug, projectId, waveId);
    } catch (error) {
      runInAction(() => {
        this.wavesByProject[projectId] = before;
      });
      throw error;
    }
  };

  createEpic = async (workspaceSlug: string, projectId: string, data: Partial<TIssue> & TEpicDetailFields) => {
    const epic = await this.service.create(workspaceSlug, projectId, data);
    runInAction(() => {
      this.epicMap[epic.id] = epic;
      this.projectEpicIds[projectId] = [...(this.projectEpicIds[projectId] ?? []), epic.id];
    });
    return epic;
  };

  convert = async (workspaceSlug: string, projectId: string, issueId: string, isEpic: boolean) => {
    const epic = await this.service.convert(workspaceSlug, projectId, issueId, isEpic);
    runInAction(() => {
      const ids = (this.projectEpicIds[projectId] ?? []).filter((id) => id !== issueId);
      if (epic) {
        this.epicMap[epic.id] = epic;
        ids.push(epic.id);
      }
      this.projectEpicIds[projectId] = ids;
    });
    return epic;
  };

  updateEpicFields = async (workspaceSlug: string, projectId: string, epicId: string, data: TEpicDetailFields) => {
    const before = this.epicMap[epicId];
    // Your own change applies at once; the server's row replaces it, or the old one comes back on failure
    if (before) runInAction(() => this.putEpic({ ...before, ...data }));
    try {
      const epic = await this.service.updateFields(workspaceSlug, projectId, epicId, data);
      runInAction(() => this.putEpic(epic));
      return epic;
    } catch (error) {
      if (before) runInAction(() => this.putEpic(before));
      throw error;
    }
  };

  fetchUpdates = async (workspaceSlug: string, projectId: string, epicId: string) => {
    const updates = await this.service.listUpdates(workspaceSlug, projectId, epicId);
    runInAction(() => {
      this.updatesByEpic[epicId] = updates;
    });
    return updates;
  };

  postUpdate = async (
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    data: { health: TEpicHealth; body: string }
  ) => {
    const update = await this.service.postUpdate(workspaceSlug, projectId, epicId, data);
    runInAction(() => {
      this.updatesByEpic[epicId] = [update, ...(this.updatesByEpic[epicId] ?? [])];
      const epic = this.epicMap[epicId];
      if (epic) this.putEpic({ ...epic, health: update.health, health_source: "update", latest_update: update });
    });
    return update;
  };
}
