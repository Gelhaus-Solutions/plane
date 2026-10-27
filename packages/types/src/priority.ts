/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "./issues";

/**
 * One of a workspace's priorities (E35): the five built-in ones and the workspace's own, each at one of the five
 * levels that sorting, grouping, analytics and PQL use (D38).
 */
export type TWorkspacePriority = {
  id: string;
  name: string;
  /** The level a built-in priority stands for; null for a custom one. */
  key: TIssuePriorities | null;
  level: TIssuePriorities;
  color: string;
  /** One of the picker's icons; empty shows the level's bars. */
  icon: string;
  description: string;
  sequence: number;
  is_builtin: boolean;
  /** How many work items show it. */
  issue_count: number | null;
  created_at: string;
  updated_at: string;
};
