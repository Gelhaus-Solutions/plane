/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { useNeedsYou } from "@/components/agents/steering/use-steering";

/** The Needs you row's count: open questions from agents and items in Review (E29). */
export const SidebarNeedsYouCount = observer(function SidebarNeedsYouCount({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { data } = useNeedsYou(workspaceSlug);
  const total = data?.counts.total ?? 0;
  if (!total) return null;

  return <span className="ml-auto text-[11.5px] text-secondary tabular-nums">{total}</span>;
});
