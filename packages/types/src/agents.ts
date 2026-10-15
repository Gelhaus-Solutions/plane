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
