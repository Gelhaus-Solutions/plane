/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

const ROW_ID = /^issue-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/**
 * The work items on the page in on-screen order. Every layout (list, board, table, calendar, timeline) gives a row the
 * id `issue-<uuid>`; the timeline renders two elements per item, so ids are deduplicated.
 */
const getRowIssueIds = (): string[] => {
  if (typeof document === "undefined") return [];
  const ids: string[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('[id^="issue-"]'))) {
    const id = ROW_ID.exec(element.id)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
};

/** Moves the peek to the previous or next work item of the layout behind it (5A, K and J). */
export const usePeekNavigation = (workspaceSlug: string, issueId: string) => {
  const {
    issue: { getIssueById },
    setPeekIssue,
  } = useIssueDetail();

  const neighbour = (step: -1 | 1): string | undefined => {
    const ids = getRowIssueIds();
    const index = ids.indexOf(issueId);
    return index === -1 ? undefined : ids[index + step];
  };

  const move = (step: -1 | 1) => {
    const targetId = neighbour(step);
    const target = targetId ? getIssueById(targetId) : undefined;
    if (!target?.project_id) return;
    setPeekIssue({ workspaceSlug, projectId: target.project_id, issueId: target.id, isArchived: !!target.archived_at });
    document.getElementById(`issue-${target.id}`)?.scrollIntoView({ block: "nearest" });
  };

  return {
    hasPrevious: neighbour(-1) !== undefined,
    hasNext: neighbour(1) !== undefined,
    move,
  };
};
