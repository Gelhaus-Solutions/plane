/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";

/** The Inbox row's unread dot and count. */
export const SidebarInboxCount = observer(function SidebarInboxCount({ workspaceSlug }: { workspaceSlug: string }) {
  const { unreadNotificationsCount, getUnreadNotificationsCount } = useWorkspaceNotifications();

  useSWR(
    workspaceSlug ? "WORKSPACE_UNREAD_NOTIFICATION_COUNT" : null,
    workspaceSlug ? () => getUnreadNotificationsCount(workspaceSlug) : null
  );

  const unread = unreadNotificationsCount.total_unread_notifications_count;
  if (!unread) return null;

  return (
    <span className="ml-auto flex items-center gap-1.5">
      <span className="size-[7px] rounded-full bg-accent-primary" aria-hidden="true" />
      <span className="text-[11.5px] text-secondary tabular-nums">{unread}</span>
    </span>
  );
});
