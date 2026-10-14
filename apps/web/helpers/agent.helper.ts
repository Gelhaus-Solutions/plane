/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Harness } from "@plane/blocks/bot-avatar";
import type { TAgentSession, TAgentSessionStatus } from "@plane/types";

/** What a bot is called in the pickers when no session of it has told its harness yet: the harness bots are named
 * after their tool. */
export const harnessFromName = (name: string | undefined): Harness => {
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("claude")) return "claude-code";
  if (lower.includes("codex")) return "codex";
  if (lower.includes("garness")) return "garness";
  return "other";
};

/** The tint of a harness's bot: Claude takes the build colour (the default), Codex the review colour. */
export const harnessColor = (harness: Harness): string | undefined =>
  harness === "codex" ? "var(--bot-review)" : undefined;

/** The shape the member pickers take for an agent bot's face. */
export const botFaceOf = (harness: Harness) => ({ harness, color: harnessColor(harness) });

const HARNESS_LABEL_KEY = {
  "claude-code": "agents.harness.claude_code",
  codex: "agents.harness.codex",
  garness: "agents.harness.garness",
  other: "agents.harness.other",
} as const;

export const harnessLabelKey = (harness: Harness) => HARNESS_LABEL_KEY[harness] ?? HARNESS_LABEL_KEY.other;

/** A session as the pickers and chips show its standing: working once it holds an item, else live or away. */
export type TAgentDisplayStatus = "working" | TAgentSessionStatus;

export const displayStatusOf = (session: Pick<TAgentSession, "status" | "holds">): TAgentDisplayStatus =>
  session.status === "live" && session.holds.length > 0 ? "working" : session.status;

/** A directory with the home folder as ~, the way the pickers show where a session runs. */
export const shortDir = (dir: string | undefined): string => (dir ?? "").replace(/^\/(?:Users|home)\/[^/]+/, "~");
