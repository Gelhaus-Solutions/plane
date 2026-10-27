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
  /** Where the holder says the item stands (E29). */
  status?: TAgentClaimStatus;
  status_text?: string;
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
  /** The item's first open question from an agent (E29), while one waits for an answer. */
  question?: TAgentQuestionRef | null;
};

export type TAgentQuestionRef = { id: string; question: string; deadline: string | null };

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
  /** The most pressing state of what the session holds and asks, its status line and how far its plan is (E29). */
  agent_state?: TAgentSessionState;
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

/* Agent steering (E29): what a session reports on its work, what it asks, and what waits for a person. */

export type TAgentClaimStatus = "working" | "waiting_for_review" | "blocked";

export type TAgentPlanStep = { title: string; state: "todo" | "doing" | "done" };

export type TAgentPlanSummary = { done: number; total: number; current: string | null };

export type TAgentSessionState = {
  state: TAgentClaimStatus | "awaiting_input" | "away" | "ended";
  status_text: string;
  plan: TAgentPlanSummary | null;
};

/** The session behind a question or an activity entry; kept by name once the session is gone. */
export type TAgentSessionOrName =
  | TAgentSessionLite
  | { id: null; name: string; status: "ended"; harness: null; bot: null };

export type TAgentWorkItemRef = { id: string; project_id: string; identifier: string; name: string };

export type TAgentQuestionStatus = "open" | "answered" | "defaulted" | "expired" | "cancelled";

export type TAgentQuestion = {
  id: string;
  work_item: TAgentWorkItemRef;
  session: TAgentSessionOrName | null;
  question: string;
  detail: string;
  /** Numbered from 1: an answer and the default name an option by its number. */
  options: { label: string; detail: string }[];
  default_option: number | null;
  deadline: string | null;
  status: TAgentQuestionStatus;
  asked_at: string;
  lapsed_at: string | null;
  answered_at: string | null;
  answered_by: { id: string; display_name: string } | null;
  answer_option: number | null;
  answer_text: string;
  answer_source: "human" | "default" | "";
  /** A person answered after the deadline had passed. */
  corrected: boolean;
};

export type TAgentActivityKind = "status" | "plan" | "progress" | "error" | "commit" | "pull_request" | "review";

export type TAgentActivityEntry = {
  id: string;
  kind: TAgentActivityKind;
  text: string;
  data: {
    state?: TAgentClaimStatus;
    steps?: TAgentPlanStep[];
    ref?: string;
    url?: string;
    state_id?: string;
    moved?: boolean;
  };
  session: TAgentSessionOrName | null;
  created_at: string;
};

export type TIssueAgentClaimProgress = {
  id: string;
  label: string;
  session: TAgentSessionLite;
  claimed_at: string;
  status: TAgentClaimStatus;
  status_text: string;
  status_at: string | null;
  plan: TAgentPlanStep[];
  plan_summary: TAgentPlanSummary;
};

/** A work item's Agent tab: the claim with its status and plan, the questions (open first), and the activity. */
export type TIssueAgentOverview = {
  claim: TIssueAgentClaimProgress | null;
  awaiting_input: boolean;
  questions: TAgentQuestion[];
  activity: TAgentActivityEntry[];
};

export type TNeedsYouReview = {
  work_item: TAgentWorkItemRef;
  session: TAgentSessionOrName | null;
  summary: string;
  at: string;
};

/** What waits for the viewer: open questions from agents and items in Review, newest first. */
export type TNeedsYou = {
  questions: TAgentQuestion[];
  reviews: TNeedsYouReview[];
  counts: { questions: number; reviews: number; total: number };
};
