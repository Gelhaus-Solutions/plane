/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMember } from "@/hooks/store/use-member";

/** The agent bots that are members of a project: the ones a work item of it can be given to. Call it from an
 * observer. */
export const useProjectBotIds = (projectId: string | undefined): string[] => {
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  if (!projectId) return [];
  return (getProjectMemberIds(projectId, false) ?? []).filter((id) => getUserDetails(id)?.is_bot);
};
