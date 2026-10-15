/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TAgentBoard,
  TAgentPanel,
  TAgentSession,
  TAgentSessionStatus,
  TIssueAgentAssignment,
  TIssueAgentRows,
  TProjectAgentRow,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/** Agent sessions and the agents on work items (E28, D46): the pickers, the rows and the Agents page. */
export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listSessions(
    workspaceSlug: string,
    params?: { status?: TAgentSessionStatus[]; bot?: string }
  ): Promise<TAgentSession[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-sessions/`, {
      params: { status: params?.status?.join(","), bot: params?.bot },
    })
      .then((response) => response?.data?.results ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieveSession(workspaceSlug: string, sessionId: string): Promise<TAgentSession> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-sessions/${sessionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** The Agents page: the sessions with what they touched and handed over, and every bot's queue. */
  async listBoard(workspaceSlug: string, statuses: TAgentSessionStatus[]): Promise<TAgentBoard> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-sessions/`, {
      params: { status: statuses.join(","), board: 1 },
    })
      .then((response) => ({ results: response?.data?.results ?? [], queues: response?.data?.queues ?? [] }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrievePanel(workspaceSlug: string, sessionId: string): Promise<TAgentPanel> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-sessions/${sessionId}/panel/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listProjectRows(workspaceSlug: string, projectId: string): Promise<TProjectAgentRow[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/agent-rows/`)
      .then((response) => response?.data?.results ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private issueBase(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/agents/`;
  }

  async listIssueAgents(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueAgentRows> {
    return this.get(this.issueBase(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async assign(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueAgentAssignment
  ): Promise<TIssueAgentRows> {
    return this.post(this.issueBase(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** A person releases the session's claim on the item; answers with the item's agents. */
  async releaseClaim(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueAgentRows> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/claim/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unassign(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    botUserId: string
  ): Promise<TIssueAgentRows> {
    return this.delete(this.issueBase(workspaceSlug, projectId, issueId), undefined, { params: { bot: botUserId } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
