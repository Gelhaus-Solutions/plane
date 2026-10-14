/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type {
  TAgentHarness,
  TAgentSession,
  TAgentSessionStatus,
  TIssueAgent,
  TIssueAgentAssignment,
  TIssueAgentRows,
  TIssueClaim,
} from "@plane/types";
import { harnessFromName } from "@/helpers/agent.helper";
import { AgentService } from "@/services/agent.service";
import type { CoreRootStore } from "./root.store";

export interface IAgentStore {
  sessionMap: Record<string, TAgentSession>;
  /** The ids of the sessions the pickers offer (live and away), from the last time the workspace was asked. */
  pickableIds: string[];
  issueRows: Record<string, TIssueAgentRows>;
  // computed functions
  getSessionById: (sessionId: string) => TAgentSession | undefined;
  getBotSessions: (botUserId: string) => TAgentSession[];
  getBotHarness: (botUserId: string, name?: string) => TAgentHarness;
  getIssueAgents: (issueId: string) => TIssueAgent[];
  getIssueClaim: (issueId: string) => TIssueClaim | null;
  getDelegatedBotIds: (issueId: string) => string[];
  // actions
  fetchSessions: (workspaceSlug: string, statuses?: TAgentSessionStatus[]) => Promise<TAgentSession[]>;
  fetchPickableSessions: (workspaceSlug: string) => Promise<TAgentSession[]>;
  fetchProjectRows: (workspaceSlug: string, projectId: string) => Promise<void>;
  /** Loads a project's agent rows unless they were loaded a moment ago; any number of rows may ask at once. */
  ensureProjectRows: (workspaceSlug: string, projectId: string, maxAgeMs?: number) => Promise<void>;
  fetchIssueAgents: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueAgentRows>;
  assign: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueAgentAssignment
  ) => Promise<TIssueAgentRows>;
  unassign: (workspaceSlug: string, projectId: string, issueId: string, botUserId: string) => Promise<TIssueAgentRows>;
}

const STATUS_ORDER: Record<TAgentSessionStatus, number> = { live: 0, away: 1, ended: 2 };

const NO_ROWS: TIssueAgentRows = { agents: [], claim: null };

/** Agent sessions and the agents on work items (E28, D46): live sessions for the pickers, and per item the agents
 * assigned to it and the session that holds it. */
export class AgentStore implements IAgentStore {
  sessionMap: Record<string, TAgentSession> = {};
  pickableIds: string[] = [];
  issueRows: Record<string, TIssueAgentRows> = {};
  private projectRowsAt: Record<string, number> = {};

  service = new AgentService();

  constructor(private rootStore: CoreRootStore) {
    makeObservable(this, {
      sessionMap: observable,
      pickableIds: observable,
      issueRows: observable,
      fetchSessions: action,
      fetchPickableSessions: action,
      fetchProjectRows: action,
      fetchIssueAgents: action,
      assign: action,
      unassign: action,
    });
  }

  getSessionById = computedFn((sessionId: string) => this.sessionMap[sessionId]);

  /** A bot's sessions that can still be picked: live first, then away, the most recently seen first. */
  getBotSessions = computedFn((botUserId: string) =>
    this.pickableIds
      .map((id) => this.sessionMap[id])
      .filter((session): session is TAgentSession => !!session && session.bot.user_id === botUserId)
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
      )
  );

  /** The harness a bot works through, from any of its sessions; before one is known, from the bot's name. */
  getBotHarness = computedFn((botUserId: string, name?: string): TAgentHarness => {
    const session = Object.values(this.sessionMap).find((item) => item.bot.user_id === botUserId);
    return session?.harness ?? harnessFromName(name);
  });

  getIssueAgents = computedFn((issueId: string) => this.issueRows[issueId]?.agents ?? NO_ROWS.agents);

  getIssueClaim = computedFn((issueId: string) => this.issueRows[issueId]?.claim ?? null);

  /** The bots that work for the item's human assignee: not assignees themselves, so the picker leaves them out. */
  getDelegatedBotIds = computedFn((issueId: string) =>
    this.getIssueAgents(issueId)
      .filter((agent) => agent.delegated)
      .map((agent) => agent.bot.id)
  );

  fetchSessions = async (workspaceSlug: string, statuses?: TAgentSessionStatus[]) => {
    const sessions = await this.service.listSessions(workspaceSlug, { status: statuses });
    runInAction(() => {
      for (const session of sessions) this.sessionMap[session.id] = session;
    });
    return sessions;
  };

  fetchPickableSessions = async (workspaceSlug: string) => {
    const sessions = await this.fetchSessions(workspaceSlug, ["live", "away"]);
    runInAction(() => {
      this.pickableIds = sessions.map((session) => session.id);
    });
    return sessions;
  };

  /** Puts a fresh listing of one item in the map, and the item's assignee list in line with it. */
  private putIssueRows(issueId: string, rows: TIssueAgentRows) {
    this.issueRows[issueId] = rows;
    const issue = this.rootStore.issue.issues.getIssueById(issueId);
    if (!issue) return;
    // a bot row is an assignee row, so the item's assignee ids hold every bot that is on it
    const botIds = new Set(rows.agents.map((agent) => agent.bot.id));
    const people = (issue.assignee_ids ?? []).filter((id) => !this.rootStore.memberRoot.getUserDetails(id)?.is_bot);
    const keptBots = (issue.assignee_ids ?? []).filter(
      (id) => this.rootStore.memberRoot.getUserDetails(id)?.is_bot && botIds.has(id)
    );
    const next = [...people, ...keptBots, ...[...botIds].filter((id) => !keptBots.includes(id))];
    this.rootStore.issue.issues.updateIssue(issueId, { assignee_ids: next });
  }

  fetchProjectRows = async (workspaceSlug: string, projectId: string) => {
    const rows = await this.service.listProjectRows(workspaceSlug, projectId);
    runInAction(() => {
      const listed = new Set(rows.map((row) => row.issue_id));
      // an item that dropped out of the listing has no agent and no claim any more
      for (const issueId of Object.keys(this.issueRows)) {
        const issue = this.rootStore.issue.issues.getIssueById(issueId);
        if (issue?.project_id === projectId && !listed.has(issueId)) delete this.issueRows[issueId];
      }
      for (const row of rows) this.issueRows[row.issue_id] = { agents: row.agents, claim: row.claim };
    });
  };

  ensureProjectRows = async (workspaceSlug: string, projectId: string, maxAgeMs = 30_000) => {
    const fetchedAt = this.projectRowsAt[projectId];
    if (fetchedAt !== undefined && Date.now() - fetchedAt < maxAgeMs) return;
    this.projectRowsAt[projectId] = Date.now();
    try {
      await this.fetchProjectRows(workspaceSlug, projectId);
    } catch (error) {
      delete this.projectRowsAt[projectId];
      throw error;
    }
  };

  fetchIssueAgents = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const rows = await this.service.listIssueAgents(workspaceSlug, projectId, issueId);
    runInAction(() => this.putIssueRows(issueId, rows));
    return rows;
  };

  assign = async (workspaceSlug: string, projectId: string, issueId: string, data: TIssueAgentAssignment) => {
    const rows = await this.service.assign(workspaceSlug, projectId, issueId, data);
    runInAction(() => this.putIssueRows(issueId, rows));
    return rows;
  };

  unassign = async (workspaceSlug: string, projectId: string, issueId: string, botUserId: string) => {
    const rows = await this.service.unassign(workspaceSlug, projectId, issueId, botUserId);
    runInAction(() => this.putIssueRows(issueId, rows));
    return rows;
  };
}
