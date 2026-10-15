/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
// components
import { AgentSessionHoverCard } from "@/components/agents/session-hover-card";
// helpers
import { botFaceOf, harnessFromName } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";

/** "Worked on by Claude · plane@6995b6f5" (r6-14): the session that holds the work item, with its card on hover. */
export const IssueClaimPill = observer(function IssueClaimPill({ issueId }: { issueId: string }) {
  const { t } = useTranslation();
  const agent = useAgent();
  const claim = agent.getIssueClaim(issueId);
  if (!claim) return null;

  const { session } = claim;
  const harness = agent.getSessionById(session.id)?.harness ?? harnessFromName(session.bot.display_name);
  return (
    <AgentSessionHoverCard
      sessionId={session.id}
      trigger={
        <span className="inline-flex h-[22px] max-w-full cursor-default items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--activity-primary)_45%,var(--border-strong))] bg-activity-subtle px-2 text-12 whitespace-nowrap text-secondary">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-activity" />
          <span>{t("agents.worked_on_by")}</span>
          <BotAvatar name={session.bot.display_name} bot size={14} {...botFaceOf(harness)} />
          <span className="font-semibold text-primary">{session.bot.display_name}</span>
          <span className="text-tertiary">·</span>
          <span className="truncate font-code text-[11.5px]">{session.name}</span>
        </span>
      }
    />
  );
});
