/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
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
