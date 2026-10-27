/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { Switch } from "@makeplane/propel/components/switch";
import { DueDateOutline, ChevronRightOutline, SearchOutline } from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
import type { TAgentBoardSession, TAgentHarness } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// helpers
import type { TAgentDisplayStatus } from "@/helpers/agent.helper";
import { botFaceOf, displayStatusOf, harnessFromName } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useWorkspace } from "@/hooks/store/use-workspace";
import useLocalStorage from "@/hooks/use-local-storage";
// local imports
import { AgentsHistoryTable } from "./history-table";
import { AgentsLiveBoard } from "./live-board";
import { Count, STATUS_COLOR } from "./parts";
import { AgentSessionPanel } from "./session-panel";

/** A bot as the page groups and filters by it: its user id, name and harness. */
export type TAgentBot = { id: string; name: string; harness: TAgentHarness };

type TTab = "live" | "history";
const LIVE_STATUSES: TAgentDisplayStatus[] = [
  "working",
  "awaiting_input",
  "waiting_for_review",
  "blocked",
  "live",
  "away",
];
const REFRESH_MS = 30_000;

const matches = (session: TAgentBoardSession, query: string) => {
  if (!query) return true;
  const words = [
    session.name,
    session.bot.display_name,
    session.git_branch,
    session.primary_dir,
    session.model,
    ...[...session.holds, ...session.touched].flatMap((item) => [item.identifier, item.name]),
  ];
  return words.some((word) => word?.toLowerCase().includes(query));
};

function FilterChip(props: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={!!props.active}
      onClick={props.onClick}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-[10px] border border-strong px-[7px] text-[11.5px] whitespace-nowrap text-secondary hover:text-primary",
        props.active && "bg-layer-1-selected text-primary"
      )}
    >
      {props.children}
    </button>
  );
}

/** The Agents page (r6-03 1C, r6-10): live sessions grouped by bot, each bot's queue, the history of ended ones,
 * and the session panel. */
export const AgentsPageRoot = observer(function AgentsPageRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const agent = useAgent();
  const { sidebarCollapsed } = useAppTheme();
  const { currentWorkspace } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab: TTab = params.get("tab") === "history" ? "history" : "live";
  const selectedId = params.get("session");
  const panelId = params.get("panel");
  const [botId, setBotId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<TAgentDisplayStatus[]>([]);
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const { storedValue: showQueues, setValue: setShowQueues } = useLocalStorage<boolean>("agents_show_queues", false);

  // the live board follows heartbeats, so it asks again every half minute; the history once per visit of the tab
  useEffect(() => {
    let alive = true;
    const load = () =>
      agent
        .fetchBoard(workspaceSlug)
        .then(() => alive && setFailed(false))
        .catch(() => alive && setFailed(true));
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [agent, workspaceSlug]);

  useEffect(() => {
    void agent.fetchHistory(workspaceSlug).catch(() => setFailed(true));
  }, [agent, workspaceSlug, tab]);

  const setParam = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );
  const closePanel = useCallback(() => setParam({ panel: null }), [setParam]);

  const pick = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => agent.boardMap[id]).filter((session): session is TAgentBoardSession => !!session);
  const live = pick(agent.liveIds);
  const history = pick(agent.historyIds);
  const current = tab === "live" ? live : history;

  const bots: TAgentBot[] = [];
  for (const session of [...live, ...history]) {
    if (!bots.some((bot) => bot.id === session.bot.user_id))
      bots.push({ id: session.bot.user_id, name: session.bot.display_name, harness: session.harness });
  }
  for (const queue of agent.queues) {
    if (!bots.some((bot) => bot.id === queue.bot.id))
      bots.push({ id: queue.bot.id, name: queue.bot.display_name, harness: harnessFromName(queue.bot.display_name) });
  }
  bots.sort((a, b) => a.name.localeCompare(b.name));

  const needle = query.trim().toLowerCase();
  const byBot = current.filter((session) => !botId || session.bot.user_id === botId);
  const shown = byBot.filter(
    (session) =>
      (tab === "history" || statuses.length === 0 || statuses.includes(displayStatusOf(session))) &&
      matches(session, needle)
  );
  const queues = agent.queues.filter((queue) => !botId || queue.bot.id === botId);
  const liveCount = live.filter((session) => session.status === "live").length;
  const awayCount = live.length - liveCount;
  const queuedCount = agent.queues.reduce((sum, queue) => sum + queue.count, 0);
  const loading = tab === "live" ? agent.liveIds === undefined : agent.historyIds === undefined;

  const toggleStatus = (status: TAgentDisplayStatus) =>
    setStatuses((list) => (list.includes(status) ? list.filter((item) => item !== status) : [...list, status]));
  const select = (sessionId: string) =>
    window.matchMedia("(min-width: 768px)").matches ? setParam({ session: sessionId }) : setParam({ panel: sessionId });

  return (
    <div className="flex size-full flex-col overflow-hidden text-13">
      <header className="flex shrink-0 flex-col gap-2 px-[18px] pt-3">
        <div className="flex min-h-7 items-center gap-2">
          {sidebarCollapsed && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            <span className="truncate">{currentWorkspace?.name}</span>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-primary">{t("agents.page.title")}</span>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">
            {t("agents.page.title")}
          </h1>
          <span
            className="inline-flex h-[22px] items-center gap-1.5 rounded-[11px] pr-2 pl-[7px] text-[11.5px] font-semibold"
            style={{
              color: "var(--activity-primary)",
              background: "color-mix(in srgb, var(--activity-primary) 14%, transparent)",
            }}
          >
            <i
              aria-hidden="true"
              className={cn("size-[7px] rounded-full bg-current", liveCount > 0 && "animate-pulse")}
            />
            {t("agents.page.live_count", { count: liveCount })}
          </span>
          {awayCount > 0 && <Count>{t("agents.page.away_count", { count: awayCount })}</Count>}
          {queuedCount > 0 && <Count>{t("agents.page.queued_count", { count: queuedCount })}</Count>}
        </div>
        <nav aria-label={t("agents.page.views")} className="-mx-[18px] flex gap-0.5 border-b border-strong px-2.5">
          {(["live", "history"] as TTab[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => setParam({ tab: key === "live" ? null : key, session: null })}
              className={cn(
                "relative flex h-[38px] items-center gap-1.5 px-2.5 text-13 font-medium whitespace-nowrap text-secondary hover:text-primary",
                tab === key &&
                  "text-primary after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-primary"
              )}
            >
              {t(`agents.page.tabs.${key}`)}
              <Count>{key === "live" ? live.length : (agent.historyIds?.length ?? 0)}</Count>
            </button>
          ))}
        </nav>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-strong px-[18px] py-2">
        <span className="mr-0.5 text-12 text-secondary">{t("agents.page.filter.bot")}</span>
        <FilterChip active={!botId} onClick={() => setBotId(null)}>
          {t("agents.page.filter.all_bots")}
        </FilterChip>
        {bots.map((bot) => (
          <FilterChip key={bot.id} active={botId === bot.id} onClick={() => setBotId(botId === bot.id ? null : bot.id)}>
            <BotAvatar name={bot.name} bot size={14} {...botFaceOf(bot.harness)} />
            {bot.name}
            <span className="text-tertiary">{current.filter((session) => session.bot.user_id === bot.id).length}</span>
          </FilterChip>
        ))}
        <span aria-hidden="true" className="mx-1.5 h-[18px] w-px bg-(--border-strong)" />
        <span className="mr-0.5 text-12 text-secondary">{t("agents.page.filter.status")}</span>
        {tab === "live" ? (
          LIVE_STATUSES.map((status) => (
            <FilterChip key={status} active={statuses.includes(status)} onClick={() => toggleStatus(status)}>
              <i aria-hidden="true" className="size-[7px] rounded-full" style={{ background: STATUS_COLOR[status] }} />
              {t(`agents.status.${status}`)}
              <span className="text-tertiary">
                {byBot.filter((session) => displayStatusOf(session) === status).length}
              </span>
            </FilterChip>
          ))
        ) : (
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-[10px] border border-strong px-[7px] text-[11.5px] text-secondary">
            <DueDateOutline className="size-3" />
            {t("agents.page.filter.last_week")}
          </span>
        )}
        <span className="flex-1" />
        {tab === "live" && (
          <label className="mr-1.5 flex cursor-pointer items-center gap-[7px] text-12 text-secondary">
            <Switch size="sm" checked={!!showQueues} onCheckedChange={(checked) => setShowQueues(checked)} />
            {t("agents.page.queues")}
          </label>
        )}
        <label className="flex h-7 w-[180px] items-center gap-2 rounded-lg border border-strong bg-layer-1 px-2.5 text-13">
          <SearchOutline className="size-3.5 shrink-0 text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("agents.page.search")}
            placeholder={t("agents.page.search")}
            className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-placeholder"
          />
        </label>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {failed && current.length === 0 ? (
          <p className="px-[18px] py-4 text-13 text-danger-primary">{t("agents.page.failed")}</p>
        ) : loading ? (
          <p className="px-[18px] py-4 text-13 text-tertiary">{t("agents.card.loading")}</p>
        ) : tab === "live" ? (
          <AgentsLiveBoard
            slug={workspaceSlug}
            bots={bots.filter((bot) => !botId || bot.id === botId)}
            sessions={shown}
            queues={needle || statuses.length ? [] : queues}
            showQueues={!!showQueues}
            selectedId={selectedId}
            onSelect={select}
            onOpen={(sessionId) => setParam({ panel: sessionId })}
          />
        ) : (
          <AgentsHistoryTable
            slug={workspaceSlug}
            sessions={shown}
            onOpen={(sessionId) => setParam({ panel: sessionId })}
          />
        )}
        {panelId && <AgentSessionPanel key={panelId} slug={workspaceSlug} sessionId={panelId} onClose={closePanel} />}
      </div>
    </div>
  );
});
