/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { NewTabArrowOutline } from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
import type { TAgentBoardSession, TAgentSessionHold } from "@plane/types";
// components
import { AgentPlanChecklist } from "@/components/agents/steering/agent-feed";
import { useIssueAgentOverview } from "@/components/agents/steering/use-steering";
// helpers
import { botFaceOf, displayStatusOf } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
// local imports
import { AgentBox, AgentHeartbeat, AgentStatusPill, BotBadge, Count, agentByline, AgentSessionFields } from "./parts";
import { AgentHoldsList, AgentInboxList, AgentRecentList } from "./sections";

const REFRESH_MS = 30_000;

/** Asks for a session's panel when it is shown, and again every half minute while it stays. */
export const usePanel = (slug: string, sessionId: string) => {
  const agent = useAgent();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      agent
        .fetchPanel(slug, sessionId)
        .then(() => alive && setFailed(false))
        .catch(() => alive && setFailed(true));
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [agent, slug, sessionId]);
  return { panel: agent.panelMap[sessionId], failed };
};

/** What the session is doing, in words: what it last said of its work, else the item it works on, or that it is idle or quiet. */
export function AgentStatusLine({ session }: { session: TAgentBoardSession }) {
  const { t } = useTranslation();
  const status = displayStatusOf(session);
  const [hold] = session.holds;
  const said = session.agent_state?.status_text;
  if (said && status !== "away" && status !== "ended") return <>{said}</>;
  if (status === "working" && hold)
    return <>{t("agents.page.line.working", { item: `${hold.identifier} ${hold.name}` })}</>;
  return <>{t(`agents.page.line.${status}`)}</>;
}

/** The plan the session reported on an item it holds (r6-03 1C), as a checklist with how far it got. */
const HoldPlan = observer(function HoldPlan(props: {
  slug: string;
  sessionId: string;
  hold: TAgentSessionHold;
  named: boolean;
}) {
  const { slug, sessionId, hold, named } = props;
  const { t } = useTranslation();
  const { data } = useIssueAgentOverview(slug, hold.project_id, hold.id);
  const claim = data?.claim;
  if (!claim || claim.session.id !== sessionId || !claim.plan.length) return null;
  return (
    <AgentBox
      label={t("agents.page.plan_title")}
      aside={
        <>
          {named && <span className="font-normal tracking-normal font-code normal-case">{hold.identifier}</span>}
          <Count>
            {claim.plan_summary.done} / {claim.plan_summary.total}
          </Count>
        </>
      }
    >
      <AgentPlanChecklist steps={claim.plan} className="px-3 py-2.5" />
    </AgentBox>
  );
});

type Props = { slug: string; session: TAgentBoardSession; onOpen: () => void };

/** The right-hand pane of the Live tab (r6-03 1C): the selected session at a glance. */
export const AgentSessionDetail = observer(function AgentSessionDetail({ slug, session, onOpen }: Props) {
  const { t } = useTranslation();
  const { panel } = usePanel(slug, session.id);
  const status = displayStatusOf(session);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-[22px] pt-[18px] pb-7">
      <div className="flex items-center gap-3">
        <BotAvatar
          name={session.bot.display_name}
          bot
          working={status === "working"}
          size={40}
          {...botFaceOf(session.harness)}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2 text-[17px] font-semibold">
            {session.bot.display_name}
            <span className="truncate font-code font-medium text-secondary">{session.name}</span>
            <BotBadge />
          </span>
          <span className="truncate text-12 text-tertiary">{agentByline(t, session)}</span>
        </div>
        <span className="flex-1" />
        <Button
          variant="secondary"
          size="sm"
          stretch="auto"
          onClick={onOpen}
          icon={<NewTabArrowOutline className="size-3.5" />}
          label={t("agents.card.open_session")}
        />
      </div>

      <div className="rounded-xl border border-strong bg-surface-2 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AgentStatusPill status={status} />
          <span className="min-w-0 truncate text-14">
            <AgentStatusLine session={session} />
          </span>
          <span className="flex-1" />
          <AgentHeartbeat at={session.last_seen_at} status={status} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          {session.holds.map((hold) => (
            <HoldPlan key={hold.id} slug={slug} sessionId={session.id} hold={hold} named={session.holds.length > 1} />
          ))}
          <AgentBox label={t("agents.page.recent_title")}>
            <AgentRecentList slug={slug} recent={panel?.recent ?? []} />
          </AgentBox>
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <AgentBox label={t("agents.card.holds")} count={session.holds.length}>
            <AgentHoldsList slug={slug} holds={session.holds} />
          </AgentBox>
          <AgentBox label={t("agents.page.session_title")}>
            <AgentSessionFields session={session} />
          </AgentBox>
          <AgentBox label={t("agents.page.inbox_title")} count={panel?.inbox.length ?? 0}>
            <AgentInboxList slug={slug} inbox={panel?.inbox ?? []} limit={3} />
          </AgentBox>
        </div>
      </div>
    </div>
  );
});
