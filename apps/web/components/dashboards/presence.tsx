/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Avatar } from "@makeplane/propel/components/avatar";
import { useTranslation } from "@plane/i18n";
import type { IUserLite } from "@plane/types";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { usePresence } from "@/hooks/use-presence";

// the faces shown before the rest fold into a count
const MAX_SHOWN = 4;

/**
 * Who else has the dashboard open (r5-21, PLANE-297): you first, outlined, then the others. Nothing while you are
 * alone, and nothing on a narrow screen.
 */
export const DashboardPresence = observer(function DashboardPresence(props: {
  workspaceSlug: string;
  dashboardId: string;
}) {
  const { workspaceSlug, dashboardId } = props;
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  const others = usePresence(`presence:dashboard:${dashboardId}`, workspaceSlug)
    .map((id) => getUserDetails(id))
    .filter((user) => user !== undefined);

  if (!currentUser || !others.length) return null;

  const shown = others.length > MAX_SHOWN ? others.slice(0, MAX_SHOWN - 1) : others;
  const more = others.length - shown.length;
  const face = (user: Pick<IUserLite, "avatar_url" | "display_name">) => (
    <Avatar
      size="sm"
      src={getFileURL(user.avatar_url)}
      alt={user.display_name}
      fallback={user.display_name.charAt(0).toUpperCase()}
      tooltip={t("dashboards.presence.here", { name: user.display_name })}
    />
  );

  return (
    <div
      role="group"
      aria-label={t("dashboards.presence.label")}
      className="mr-1.5 hidden items-center gap-1.5 sm:flex"
    >
      <span className="flex rounded-full shadow-[0_0_0_2px_var(--bg-surface-1)]">{face(currentUser)}</span>
      {shown.map((user) => (
        <span key={user.id} className="flex">
          {face(user)}
        </span>
      ))}
      {more > 0 && (
        <span
          className="flex h-6 items-center rounded-full border border-strong px-1.5 text-11 text-secondary tabular-nums"
          title={t("dashboards.presence.more", { count: more })}
        >
          +{more}
        </span>
      )}
    </div>
  );
});
