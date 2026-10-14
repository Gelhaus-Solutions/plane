/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TStateGroups } from "./state";

/** An epic's health: the latest posted update, or derived from the pace (E11). */
export type TEpicHealth = "on_track" | "at_risk" | "off_track";

export type TEpicSize = "XS" | "S" | "M" | "L" | "XL";

export const EPIC_SIZES: TEpicSize[] = ["XS", "S", "M", "L", "XL"];

/** An epic's children per bucket; Review is apart from the other started states, cancelled is out of scope. */
export type TEpicProgress = {
  completed: number;
  review: number;
  started: number;
  unstarted: number;
  backlog: number;
  cancelled: number;
  total: number;
};

export type TEpicUpdate = {
  id: string;
  epic_id: string;
  health: TEpicHealth;
  body: string;
  created_at: string;
  created_by: string | null;
};

/** An agent at work on one of the epic's children. */
export type TEpicWorking = {
  issue_id: string;
  sequence_id: number;
  user_id: string;
  display_name: string;
};

export type TEpicWave = {
  id: string;
  project_id: string;
  code: string;
  name: string;
  sort_order: number;
};

/** A row of the epic lists: the work item, its epic fields, progress and health. */
export type TEpic = {
  id: string;
  project_id: string;
  sequence_id: number;
  name: string;
  state_id: string | null;
  state_group: TStateGroups | null;
  priority: string;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  assignee_ids: string[];
  label_ids: string[];
  lead_id: string | null;
  size: TEpicSize | null;
  wave_id: string | null;
  progress: TEpicProgress;
  health: TEpicHealth | null;
  health_source: "update" | "pace" | null;
  projected_date: string | null;
  latest_update: TEpicUpdate | null;
  working: TEpicWorking | null;
};

export type TEpicBurnupPoint = { date: string; scope: number; done: number };

export type TEpicNeed = {
  id: string;
  project_id: string;
  project_identifier: string;
  sequence_id: number;
  name: string;
  state_id: string | null;
  state_group: TStateGroups | null;
  state_name: string | null;
  is_review: boolean;
};

/** One epic's page: the row plus description, burn-up, what it needs and the project's Review states. */
export type TEpicDetail = TEpic & {
  description_html: string;
  burnup: TEpicBurnupPoint[];
  added_this_month: number;
  pace_window_days: number;
  needs: TEpicNeed[];
  review_state_ids: string[];
};

export type TWorkspaceEpicStats = {
  total: number;
  projects: number;
  in_progress: number;
  on_track: number;
  at_risk: number;
  off_track: number;
  done_this_quarter: number;
};

export type TWorkspaceEpicStatus = "open" | "all" | "done";

export type TEpicDetailFields = Partial<Pick<TEpic, "lead_id" | "wave_id" | "size">>;
