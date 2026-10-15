/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** A session's standing: live, away (quiet for a while) or ended. */
export type TAgentSessionStatus = "live" | "away" | "ended";

export type TAgentHarness = "claude-code" | "codex" | "garness" | "other";

/** A work item a session holds (its open claim). */
export type TAgentSessionHold = {
  id: string;
  project_id: string;
  identifier: string;
  name: string;
  state_group: string | null;
  claimed_at: string;
};

/** One run of an agent harness (Claude Code, Codex) working through its bot (E28). */
export type TAgentSession = {
  id: string;
  bot: { id: string; user_id: string; display_name: string; avatar_url?: string | null };
  harness: TAgentHarness;
  external_id: string;
  generation: number;
  /** The agent bus name, `<scope>@<first 8 of the session id>`. */
  name: string;
  primary_dir: string;
  host: string;
  git_branch: string;
  model: string;
  harness_version: string;
  parent: string | null;
  status: TAgentSessionStatus;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  end_reason: string;
  holds: TAgentSessionHold[];
};

/** The session behind a comment or an activity: what its chip needs. */
export type TAgentSessionLite = TAgentSessionRef & {
  harness: TAgentHarness;
  bot: { id: string; display_name: string };
};

/** The session a chip or a row names: enough to draw it, not the whole run. */
export type TAgentSessionRef = {
  id: string;
  name: string;
  status: TAgentSessionStatus;
};

/**
 * An agent on a work item. `queue`: the bot's queue, any of its sessions may take it. `session`: one session's.
 * `waiting`: the session it named has ended, so it waits for a new one.
 */
export type TIssueAgentState = "queue" | "session" | "waiting";

export type TIssueAgent = {
  bot: { id: string; display_name: string };
  session: TAgentSessionRef | null;
  state: TIssueAgentState;
  /** The bot works for the item's human assignee, who stays accountable. */
  delegated: boolean;
};

/** The open claim on a work item: the session that says it works on it. */
export type TIssueClaim = {
  session: TAgentSessionRef & { bot: { id: string; display_name: string } };
  claimed_at: string;
};

export type TIssueAgentRows = {
  agents: TIssueAgent[];
  claim: TIssueClaim | null;
};

/** What a project's agent-rows lists per work item. */
export type TProjectAgentRow = TIssueAgentRows & { issue_id: string };

/** Naming a bot (its queue), one of its sessions, or a bot to delegate to. */
export type TIssueAgentAssignment = { bot?: string; session?: string; delegate?: boolean };

/** A work item as the Agents page names it. */
export type TAgentItemRef = {
  id: string;
  project_id: string;
  identifier: string;
  name: string;
};

/** What an ended session left behind: the later session it handed its items to, and the items still waiting. */
export type TAgentSessionHandoff = {
  to: TAgentSessionRef | null;
  items: TAgentItemRef[];
  waiting: TAgentItemRef[];
};

/** A session on the Agents page: also the items it claimed or changed and, once ended, what it handed over. */
export type TAgentBoardSession = TAgentSession & {
  touched: (TAgentItemRef & { state_group: string | null })[];
  handoff: TAgentSessionHandoff | null;
};

/** A bot's queue: open items assigned or delegated to the bot alone that no session holds. */
export type TAgentQueue = {
  bot: { id: string; display_name: string };
  count: number;
  items: (TAgentItemRef & { state_group: string | null; delegated: boolean })[];
};

export type TAgentBoard = {
  results: TAgentBoardSession[];
  queues: TAgentQueue[];
};

/** How a session touched an item: it holds or held the claim, filed, completed, commented, changed, or was named. */
export type TAgentPanelItemRole =
  | "holds"
  | "claimed"
  | "filed"
  | "completed"
  | "commented"
  | "updated"
  | "assigned"
  | "delegated";

export type TAgentPanelItem = TAgentItemRef & {
  state_group: string | null;
  roles: TAgentPanelItemRole[];
  at: string;
};

export type TAgentPanelClaim = {
  item: TAgentItemRef;
  claimed_at: string;
  ended_at: string | null;
  end_reason: string;
};

/** A handover the session received; an earlier session is named even after it was deleted (then without an id). */
export type TAgentPanelHandoverIn = {
  from_sessions: (Omit<TAgentSessionRef, "id"> & { id: string | null })[];
  items: TAgentItemRef[];
  at: string;
  acked_at: string | null;
};

export type TAgentInboxKind = "mention" | "comment" | "assignment" | "handover" | "answer";

export type TAgentPanelInboxEntry = {
  id: string;
  kind: TAgentInboxKind;
  body: string;
  item: TAgentItemRef | null;
  actor: string | null;
  from_session: TAgentSessionRef | null;
  /** Sent to the bot's queue, and taken by this session. */
  queue: boolean;
  at: string;
  acked_at: string | null;
};

export type TAgentPanelRecent = {
  kind: TAgentPanelItemRole | "released";
  field: string | null;
  item: TAgentItemRef;
  at: string;
};

/** The session panel (r6-10). */
export type TAgentPanel = TAgentBoardSession & {
  items: TAgentPanelItem[];
  claims: TAgentPanelClaim[];
  handoffs: {
    received: TAgentPanelHandoverIn[];
    given: { to: TAgentSessionRef; items: TAgentItemRef[] } | null;
    waiting: TAgentItemRef[];
  };
  inbox: TAgentPanelInboxEntry[];
  recent: TAgentPanelRecent[];
};
