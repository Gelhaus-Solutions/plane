/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Badge } from "@makeplane/propel/components/badge";
import { useTranslation } from "@plane/i18n";
import type { TAgentDisplayStatus } from "@/helpers/agent.helper";

const VARIANT = {
  working: "success",
  awaiting_input: "warning",
  waiting_for_review: "indigo",
  blocked: "danger",
  live: "success",
  away: "grey",
  ended: "grey",
} as const;

/** A session's standing as a small badge: Working and Live in green, Away and Ended grey, the steering states in their own tones. */
export function AgentStatusBadge({ status }: { status: TAgentDisplayStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={VARIANT[status]}
      size="xs"
      label={t(`agents.status.${status}`)}
      startIcon={<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
    />
  );
}
