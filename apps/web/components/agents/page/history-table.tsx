/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ArrowNarrowRightOutline, ClockOutline, TransferWorkItemOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAgentBoardSession, TStateGroups } from "@plane/types";
// components
import { AgentSessionChip } from "@/components/agents/session-chip";
import { EpicStateIcon } from "@/components/epics/parts";
// local imports
import { AgentItemLink, AgentStatusPill, Count, agentRan, agentUntil, agentWhen } from "./parts";

const TOUCHED_SHOWN = 2;
const COLUMNS = "grid-cols-[minmax(240px,1.4fr)_170px_70px_minmax(160px,1fr)_minmax(180px,1.2fr)_110px]";

type Props = { slug: string; sessions: TAgentBoardSession[]; onOpen: (sessionId: string) => void };

/** The History tab (r6-03): ended sessions with how long they ran, what they touched and what they handed over. */
export const AgentsHistoryTable = observer(function AgentsHistoryTable({ slug, sessions, onOpen }: Props) {
  const { t } = useTranslation();

  const handoff = (session: TAgentBoardSession) => {
    const left = session.handoff;
    if (left?.to && left.items.length > 0)
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <TransferWorkItemOutline className="size-3.5 shrink-0 text-secondary" />
          {left.items.slice(0, 1).map((item) => (
            <AgentItemLink key={item.id} slug={slug} item={item} className="text-primary" />
          ))}
          {left.items.length > 1 && <Count>+{left.items.length - 1}</Count>}
          <span className="shrink-0 text-secondary">{t("agents.page.handoff_to")}</span>
          <AgentSessionChip session={{ id: left.to.id, name: left.to.name }} size="sm" showBot={false} />
        </span>
      );
    if (left && left.waiting.length > 0)
      return (
        <span className="flex min-w-0 items-center gap-1.5 text-warning-primary">
          <ClockOutline className="size-3.5 shrink-0" />
          <AgentItemLink slug={slug} item={left.waiting[0]} className="text-warning-primary" />
          {left.waiting.length > 1 && <Count>+{left.waiting.length - 1}</Count>}
          <span className="truncate">{t("agents.page.handoff_waiting")}</span>
        </span>
      );
    return (
      <span className="truncate text-secondary">
        {session.touched.length === 0 ? t("agents.page.history.no_items") : t("agents.page.history.no_handoff")}
      </span>
    );
  };

  if (sessions.length === 0)
    return <p className="px-[18px] py-4 text-13 text-tertiary">{t("agents.page.history.none")}</p>;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-[960px]">
        <div
          className={`grid ${COLUMNS} h-[30px] items-center gap-3 border-b border-subtle px-[18px] text-12 text-secondary`}
        >
          <span>{t("agents.page.history.session")}</span>
          <span>{t("agents.page.history.started_ended")}</span>
          <span>{t("agents.page.history.ran")}</span>
          <span>{t("agents.page.history.touched")}</span>
          <span>{t("agents.page.history.handoff")}</span>
          <span>{t("agents.card.model")}</span>
        </div>
        {sessions.map((session) => (
          // the whole row opens the session for the mouse; the session cell is its button for the keyboard
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            key={session.id}
            onClick={() => onOpen(session.id)}
            className={`grid ${COLUMNS} h-[45px] cursor-pointer items-center gap-3 border-b border-subtle px-[18px] text-[12.5px] hover:bg-layer-1-hover`}
          >
            <button
              type="button"
              aria-label={t("agents.card.open_session")}
              onClick={(event) => {
                event.stopPropagation();
                onOpen(session.id);
              }}
              className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
            >
              <AgentSessionChip session={session} />
              <AgentStatusPill status="ended" />
            </button>
            <span className="flex items-center gap-1 whitespace-nowrap">
              {agentWhen(t, session.started_at, true)}
              <ArrowNarrowRightOutline className="size-3 text-tertiary" />
              {session.ended_at ? agentUntil(t, session.started_at, session.ended_at) : ""}
            </span>
            <span className="whitespace-nowrap">{agentRan(session.started_at, session.ended_at)}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              {session.touched.length === 0 && (
                <span className="text-secondary">{t("agents.page.history.none_touched")}</span>
              )}
              {session.touched.slice(0, TOUCHED_SHOWN).map((item) => (
                <span key={item.id} className="flex shrink-0 items-center gap-1">
                  <EpicStateIcon group={(item.state_group as TStateGroups | null) ?? null} size="sm" />
                  <AgentItemLink slug={slug} item={item} className="text-primary" />
                </span>
              ))}
              {session.touched.length > TOUCHED_SHOWN && <Count>+{session.touched.length - TOUCHED_SHOWN}</Count>}
            </span>
            {handoff(session)}
            <span className="truncate font-code text-12 text-secondary">{session.model}</span>
          </div>
        ))}
        <p className="px-[18px] py-4 text-12 text-secondary">{t("agents.page.history.footer")}</p>
      </div>
    </div>
  );
});
