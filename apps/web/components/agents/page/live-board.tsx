/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { BulletedListOutline, ChevronDownOutline, ChevronRightOutline, UserPlusOutline } from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
import type { TAgentBoardSession, TAgentQueue, TStateGroups } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { EpicStateIcon } from "@/components/epics/parts";
// helpers
import { botFaceOf, displayStatusOf } from "@/helpers/agent.helper";
// local imports
import type { TAgentBot } from "./root";
import { AgentHeartbeat, AgentItemLink, AgentStaleFlag, AgentStatusDot, BotBadge, Count } from "./parts";
import { AgentSessionDetail } from "./session-detail";

type Props = {
  slug: string;
  bots: TAgentBot[];
  sessions: TAgentBoardSession[];
  queues: TAgentQueue[];
  showQueues: boolean;
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  onOpen: (sessionId: string) => void;
};

/** The Live tab (r6-03 1C): live and away sessions grouped by bot on the left, the selected one on the right. */
export const AgentsLiveBoard = observer(function AgentsLiveBoard(props: Props) {
  const { slug, bots, sessions, queues, showQueues, selectedId, onSelect, onOpen } = props;
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const queueOf = (botId: string) => queues.find((queue) => queue.bot.id === botId);
  const groups = bots
    .map((bot) => ({
      bot,
      sessions: sessions.filter((session) => session.bot.user_id === bot.id),
      queue: queueOf(bot.id),
    }))
    .filter((group) => group.sessions.length > 0 || (showQueues && group.queue));
  const queued = queues.reduce((sum, queue) => sum + queue.count, 0);
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-full shrink-0 overflow-auto border-r border-strong md:w-[400px]">
        {groups.length === 0 && <p className="px-[18px] py-4 text-13 text-tertiary">{t("agents.page.none_live")}</p>}
        {groups.map(({ bot, sessions: botSessions, queue }) => {
          const live = botSessions.filter((session) => session.status === "live").length;
          const away = botSessions.length - live;
          const isCollapsed = collapsed[bot.id];
          return (
            <div key={bot.id}>
              <div className="flex h-10 items-center gap-2 border-b border-subtle bg-surface-2 pr-[18px] pl-3">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-label={bot.name}
                  onClick={() => setCollapsed((current) => ({ ...current, [bot.id]: !current[bot.id] }))}
                  className="grid size-4 place-items-center text-tertiary hover:text-primary"
                >
                  {isCollapsed ? (
                    <ChevronRightOutline className="size-3.5" />
                  ) : (
                    <ChevronDownOutline className="size-3.5" />
                  )}
                </button>
                <BotAvatar
                  name={bot.name}
                  bot
                  size={22}
                  working={botSessions.some((session) => displayStatusOf(session) === "working")}
                  {...botFaceOf(bot.harness)}
                />
                <span className="text-13 font-semibold">{bot.name}</span>
                <BotBadge />
                {live > 0 && <Count>{t("agents.page.live_count", { count: live })}</Count>}
                {away > 0 && <Count>{t("agents.page.away_count", { count: away })}</Count>}
                <span className="flex-1" />
                {queue && (
                  <span title={t("agents.page.queue")} className="flex items-center gap-1.5 text-12 text-secondary">
                    <BulletedListOutline className="size-3.5" />
                    <Count>{queue.count}</Count>
                  </span>
                )}
              </div>
              {!isCollapsed &&
                botSessions.map((session) => {
                  const status = displayStatusOf(session);
                  const [hold] = session.holds;
                  const isSelected = selected?.id === session.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => onSelect(session.id)}
                      onDoubleClick={() => onOpen(session.id)}
                      className={cn(
                        "flex w-full flex-col gap-[3px] border-b border-subtle py-2 pr-3.5 pl-[30px] text-left hover:bg-layer-1-hover",
                        isSelected && "bg-layer-1-selected shadow-[inset_2px_0_0_var(--bg-accent-primary)]"
                      )}
                    >
                      <span className="flex w-full min-w-0 items-center gap-2">
                        <AgentStatusDot status={status} />
                        <span className="truncate font-code text-[12.5px] font-medium">{session.name}</span>
                        <span className="flex-1" />
                        {status === "away" && <AgentStaleFlag />}
                        <AgentHeartbeat at={session.last_seen_at} status={status} />
                      </span>
                      <span className="flex w-full min-w-0 items-center gap-2 pl-4 text-12 whitespace-nowrap text-secondary">
                        {t(`agents.status.${status}`)}
                        <span className="text-tertiary">·</span>
                        {hold ? (
                          <>
                            <span className="shrink-0 font-code text-11">{hold.identifier}</span>
                            <span className="min-w-0 truncate">{hold.name}</span>
                          </>
                        ) : (
                          <span className="min-w-0 truncate text-tertiary">
                            {session.git_branch || t("agents.mention.idle")}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              {!isCollapsed && showQueues && queue && (
                <div className="border-b border-subtle pt-1.5 pb-2">
                  <div className="flex h-[26px] items-center gap-1.5 pr-3.5 pl-[30px] text-[11.5px] text-secondary">
                    <BulletedListOutline className="size-3.5" />
                    {t("agents.page.queue")}
                    <Count>{queue.count}</Count>
                  </div>
                  {queue.items.map((item) => (
                    <div key={item.id} className="flex h-[30px] items-center gap-2 pr-3.5 pl-[30px] text-[12.5px]">
                      <EpicStateIcon group={(item.state_group as TStateGroups | null) ?? null} size="sm" />
                      <AgentItemLink slug={slug} item={item} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {item.delegated && (
                        <span title={t("agents.page.delegated")} className="text-tertiary">
                          <UserPlusOutline className="size-3.5" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!showQueues && queued > 0 && (
          <p className="flex items-center gap-1.5 px-3.5 py-3 text-12 text-tertiary">
            <BulletedListOutline className="size-3.5 shrink-0" />
            {t("agents.page.queue_hidden", { count: queued })}
          </p>
        )}
      </div>
      <div className="hidden min-w-0 flex-1 md:flex">
        {selected ? (
          <AgentSessionDetail key={selected.id} slug={slug} session={selected} onOpen={() => onOpen(selected.id)} />
        ) : (
          <p className="m-auto max-w-sm px-6 text-center text-13 text-tertiary">{t("agents.page.none_selected")}</p>
        )}
      </div>
    </div>
  );
});
