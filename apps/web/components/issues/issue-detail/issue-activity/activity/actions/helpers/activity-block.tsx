/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { HierarchyOutline } from "@makeplane/propel/icons";
// plane imports
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { renderFormattedTime, renderFormattedDate, calculateTimeAgo } from "@plane/utils";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { IssueUser } from "../";
import { IssueCreatorDisplay } from "./issue-creator";

type TIssueActivityBlockComponent = {
  icon?: ReactNode;
  activityId: string;
  ends: "top" | "bottom" | undefined;
  children: ReactNode;
  customUserName?: string;
};

export function IssueActivityBlockComponent(props: TIssueActivityBlockComponent) {
  const { icon, activityId, children, customUserName } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  const { isMobile } = usePlatformOS();
  if (!activity) return <></>;
  return (
    <div className="flex items-center gap-2 pl-[3px] text-[12.5px] text-secondary">
      <span className="grid size-[18px] shrink-0 place-items-center text-secondary [&_svg]:size-3.5" aria-hidden="true">
        {icon ? icon : <HierarchyOutline />}
      </span>
      <div className="min-w-0 flex-1 truncate">
        {!activity?.field && activity?.verb === "created" ? (
          <IssueCreatorDisplay activityId={activityId} customUserName={customUserName} />
        ) : (
          <IssueUser activityId={activityId} customUserName={customUserName} />
        )}
        <span> {children} </span>
        <Tooltip
          label={`${renderFormattedDate(activity.created_at)}, ${renderFormattedTime(activity.created_at)}`}
          disabled={isMobile}
        >
          <span className="whitespace-nowrap text-tertiary">· {calculateTimeAgo(activity.created_at)}</span>
        </Tooltip>
      </div>
    </div>
  );
}
