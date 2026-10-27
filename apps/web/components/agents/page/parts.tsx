/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { ActivityOutline, WarningTriangleOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAgentItemRef, TAgentSession } from "@plane/types";
import { calculateTimeAgoShort, cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// helpers
import type { TAgentDisplayStatus } from "@/helpers/agent.helper";
import { harnessLabelKey, shortDir } from "@/helpers/agent.helper";

export const STATUS_COLOR: Record<TAgentDisplayStatus, string> = {
  working: "var(--activity-primary)",
  awaiting_input: "var(--txt-warning-primary)",
  waiting_for_review: "var(--state-started-2)",
  blocked: "var(--txt-danger-primary)",
  live: "var(--txt-success-primary)",
  away: "var(--txt-tertiary)",
  ended: "var(--txt-tertiary)",
};

/** A session's standing as the frames draw it: a tinted pill with a dot that pulses while the session works. */
export function AgentStatusPill({ status }: { status: TAgentDisplayStatus }) {
  const { t } = useTranslation();
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[11px] pr-2 pl-[7px] text-[11.5px] font-semibold whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <i
        aria-hidden="true"
        className={cn("size-[7px] rounded-full bg-current", status === "working" && "animate-pulse")}
      />
      {t(`agents.status.${status}`)}
    </span>
  );
}

export function AgentStatusDot({ status }: { status: TAgentDisplayStatus }) {
  return (
    <i
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", status === "working" && "animate-pulse")}
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

/** The small grey count beside a label (the frames' `tn`). */
export function Count({ children }: { children: ReactNode }) {
  return (
    <span className="font-normal tracking-normal rounded-[5px] bg-layer-2 px-[5px] text-11 leading-4 whitespace-nowrap text-secondary normal-case">
      {children}
    </span>
  );
}

/** A titled box of the session pane and panel (the frames' `box`). */
export function AgentBox(props: { label: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  const { label, count, aside, children } = props;
  return (
    <section aria-label={label} className="min-w-0 rounded-xl border border-strong bg-surface-1 shadow-e1">
      <div className="flex h-[38px] items-center gap-2 border-b border-subtle px-3 text-10-5 font-semibold tracking-[0.08em] text-secondary uppercase">
        {label}
        <span className="flex-1" />
        {aside}
        {count !== undefined && <Count>{count}</Count>}
      </div>
      {children}
    </section>
  );
}

/** A work item's identifier, in mono, linking to the item. */
export function AgentItemLink(props: { slug: string; item: TAgentItemRef; className?: string }) {
  const { slug, item, className } = props;
  return (
    <Link
      to={`/${slug}/browse/${item.identifier}/`}
      title={item.name}
      onClick={(event) => event.stopPropagation()}
      className={cn("shrink-0 font-code text-11 text-secondary hover:text-primary hover:underline", className)}
    >
      {item.identifier}
    </Link>
  );
}

/** The last heartbeat: a pulsing dot while the session works, a pulse line otherwise, amber once it went away. */
export function AgentHeartbeat({ at, status }: { at: string; status: TAgentDisplayStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-[5px] text-12 whitespace-nowrap",
        status === "away" ? "text-warning-primary" : "text-secondary"
      )}
    >
      {status === "working" ? (
        <i aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-activity" />
      ) : (
        <ActivityOutline className="size-3" />
      )}
      {agentAgo(t, at)}
    </span>
  );
}

export function AgentStaleFlag() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-11 font-semibold whitespace-nowrap text-warning-primary">
      <WarningTriangleOutline className="size-3" />
      {t("agents.page.stale")}
    </span>
  );
}

/** The small BOT tag beside a bot's name (the frames' `botb`). */
export function BotBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded-[5px] bg-accent-subtle px-[5px] text-[9.5px] leading-none font-semibold tracking-[0.06em] text-accent-primary uppercase">
      {t("agents.bot")}
    </span>
  );
}

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
const dayOffset = (date: Date) => Math.round((midnight(new Date()) - midnight(date)) / 86_400_000);

/** A moment as the page writes it: today 09:12, yesterday 13:28, or Oct 14, 22:30; `bareToday` drops the "today". */
export const agentWhen = (t: TTranslate, value: string | null | undefined, bareToday = false) => {
  if (!value) return "";
  const time = renderFormattedTime(value);
  const days = dayOffset(new Date(value));
  if (days === 0) return bareToday ? time : t("agents.page.today_at", { time });
  if (days === 1) return t("agents.page.yesterday_at", { time });
  return `${renderFormattedDate(value, "MMM d") ?? ""}, ${time}`;
};

/** When a run ended, after its start: only the time on the same day. */
export const agentUntil = (t: TTranslate, from: string, to: string) =>
  dayOffset(new Date(from)) === dayOffset(new Date(to)) ? renderFormattedTime(to) : agentWhen(t, to, true);

/** How long ago, as the frames write it: 40s ago, 2m ago, 3h ago. */
export const agentAgo = (t: TTranslate, value: string | null | undefined) =>
  value ? t("agents.page.ago", { time: calculateTimeAgoShort(value) }) : "";

/** How long a session ran, as 2h 40m. */
export const agentRan = (from: string, to: string | null) => {
  const minutes = Math.max(
    0,
    Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60_000)
  );
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

/** Harness and version, model and host on one line, as under the session's name. */
export const agentByline = (t: (key: string) => string, session: TAgentSession, withHost = true) =>
  [
    `${t(harnessLabelKey(session.harness))}${session.harness_version ? ` ${session.harness_version}` : ""}`,
    session.model,
    withHost ? session.host : "",
  ]
    .filter(Boolean)
    .join(" · ");

/** Where a session runs and how long: the rows of the Session box. */
export const AgentSessionFields = observer(function AgentSessionFields(props: {
  session: TAgentSession;
  extra?: [string, ReactNode][];
}) {
  const { session, extra = [] } = props;
  const { t } = useTranslation();
  const rows: [string, ReactNode, boolean][] = [
    [
      t("agents.card.harness"),
      <span key="harness">
        {t(harnessLabelKey(session.harness))} <span className="text-tertiary">{session.harness_version}</span>
      </span>,
      false,
    ],
    [t("agents.card.model"), session.model, true],
    [t("agents.card.primary_dir"), shortDir(session.primary_dir), true],
    [t("agents.card.host"), session.host, true],
    [t("agents.card.branch"), session.git_branch, true],
    [t("agents.card.started"), agentWhen(t, session.started_at), false],
    [t("agents.card.last_seen"), agentAgo(t, session.last_seen_at), false],
    [
      t("agents.card.ended"),
      session.ended_at ? (
        agentWhen(t, session.ended_at)
      ) : (
        <span key="ended" className="text-tertiary">
          {t("agents.card.still_live")}
        </span>
      ),
      false,
    ],
  ];
  return (
    <dl className="px-3 pt-1.5 pb-2.5">
      {[...rows, ...extra.map(([label, value]): [string, ReactNode, boolean] => [label, value, false])]
        .filter(([, value]) => value)
        .map(([label, value, mono]) => (
          <div key={label} className="grid min-h-[26px] grid-cols-[96px_minmax(0,1fr)] items-center text-[12.5px]">
            <dt className="text-secondary">{label}</dt>
            <dd className={cn("truncate text-primary", mono && "font-code")}>{value}</dd>
          </div>
        ))}
    </dl>
  );
});
