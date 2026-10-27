/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import type { TWorkspacePriority } from "@plane/types";
// services
import { PriorityService } from "@/services/priority.service";

export interface IPriorityStore {
  /** The workspace's priorities by slug, in the server's order: by level, the built-in one first in each. */
  prioritiesMap: Record<string, TWorkspacePriority[]>;
  getPriorities: (workspaceSlug: string) => TWorkspacePriority[] | undefined;
  getPriorityById: (workspaceSlug: string, id: string | null | undefined) => TWorkspacePriority | undefined;
  /** Asks once per workspace, however many pickers want them at the same time. */
  fetchPriorities: (workspaceSlug: string, force?: boolean) => Promise<TWorkspacePriority[]>;
  createPriority: (workspaceSlug: string, data: Partial<TWorkspacePriority>) => Promise<TWorkspacePriority>;
  updatePriority: (workspaceSlug: string, id: string, data: Partial<TWorkspacePriority>) => Promise<TWorkspacePriority>;
  deletePriority: (workspaceSlug: string, id: string) => Promise<void>;
}

/** A workspace's priorities (E35), for the pickers, the rows and the settings editor. */
export class PriorityStore implements IPriorityStore {
  prioritiesMap: Record<string, TWorkspacePriority[]> = {};
  private inFlight: Record<string, Promise<TWorkspacePriority[]> | undefined> = {};
  private service = new PriorityService();

  constructor() {
    makeObservable(this, {
      prioritiesMap: observable,
      fetchPriorities: action,
      createPriority: action,
      updatePriority: action,
      deletePriority: action,
    });
  }

  getPriorities = (workspaceSlug: string) => this.prioritiesMap[workspaceSlug];

  getPriorityById = (workspaceSlug: string, id: string | null | undefined) =>
    id ? this.prioritiesMap[workspaceSlug]?.find((priority) => priority.id === id) : undefined;

  fetchPriorities = (workspaceSlug: string, force = false) => {
    if (!force && this.prioritiesMap[workspaceSlug]) return Promise.resolve(this.prioritiesMap[workspaceSlug]);
    const pending = this.inFlight[workspaceSlug];
    if (pending) return pending;
    const request = this.service
      .list(workspaceSlug)
      .then((priorities) => {
        runInAction(() => {
          this.prioritiesMap[workspaceSlug] = priorities;
        });
        return priorities;
      })
      .finally(() => {
        this.inFlight[workspaceSlug] = undefined;
      });
    this.inFlight[workspaceSlug] = request;
    return request;
  };

  // a change can reorder the list and move counts, so the list is asked again after each
  createPriority = async (workspaceSlug: string, data: Partial<TWorkspacePriority>) => {
    const priority = await this.service.create(workspaceSlug, data);
    await this.fetchPriorities(workspaceSlug, true);
    return priority;
  };

  updatePriority = async (workspaceSlug: string, id: string, data: Partial<TWorkspacePriority>) => {
    const priority = await this.service.update(workspaceSlug, id, data);
    await this.fetchPriorities(workspaceSlug, true);
    return priority;
  };

  deletePriority = async (workspaceSlug: string, id: string) => {
    await this.service.remove(workspaceSlug, id);
    await this.fetchPriorities(workspaceSlug, true);
  };
}
