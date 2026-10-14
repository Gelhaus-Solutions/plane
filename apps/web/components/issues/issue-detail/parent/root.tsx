/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { EpicOutline, ParentOutline } from "@makeplane/propel/icons";
// plane imports
import type { TIssue } from "@plane/types";
import { ControlLink } from "@plane/blocks/layout";
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";

export type TIssueParentDetail = {
  workspaceSlug: string;
  issue: TIssue;
};

/** The parent as a chip beside the item's ID (4A): its icon and name, linking to it. */
export const IssueParentDetail = observer(function IssueParentDetail(props: TIssueParentDetail) {
  const { workspaceSlug, issue } = props;
  const router = useRouter();
  const { issueMap } = useIssues();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  const { getProjectIdentifierById } = useProject();

  const parentIssue = issueMap?.[issue.parent_id || ""] || undefined;
  if (!parentIssue) return <></>;

  const isParentEpic = parentIssue.is_epic;
  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: parentIssue.project_id,
    issueId: parentIssue.id,
    projectIdentifier: getProjectIdentifierById(parentIssue.project_id),
    sequenceId: parentIssue.sequence_id,
    isEpic: isParentEpic,
  });

  const handleParentIssueClick = () => {
    if (isParentEpic) router.push(workItemLink);
    else handleRedirection(workspaceSlug, parentIssue, isMobile);
  };

  const ParentIcon = isParentEpic ? EpicOutline : ParentOutline;
  return (
    <ControlLink
      href={workItemLink}
      onClick={handleParentIssueClick}
      title={parentIssue.name}
      className="flex h-5 max-w-60 min-w-0 items-center gap-[5px] rounded-[10px] bg-layer-2 px-[7px] text-[11.5px] text-secondary transition-colors hover:text-primary"
    >
      <ParentIcon className="size-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{parentIssue.name}</span>
    </ControlLink>
  );
});
