/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import {
  AtOutline,
  ChatOutline,
  CheckDoneOutline,
  ClockOutline,
  CompletedAtOutline,
  CreatedAtOutline,
  LockOutline,
  TransferWorkItemOutline,
  UnlockedOutline,
  UpdatedAtOutline,
  UserPlusOutline,
} from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type {
  TAgentInboxKind,
  TAgentItemRef,
  TAgentPanel,
  TAgentPanelInboxEntry,
  TAgentPanelRecent,
  TAgentSessionRef,
  TStateGroups,
} from "@plane/types";
// components
import { AgentSessionChip } from "@/components/agents/session-chip";
import { EpicStateIcon } from "@/components/epics/parts";
// local imports
import { AgentItemLink, agentAgo, agentWhen } from "./parts";

const RECENT_ICON: Record<TAgentPanelRecent["kind"], ReactNode> = {
  filed: <CreatedAtOutline className="size-3.5 shrink-0" />,
  completed: <CompletedAtOutline className="size-3.5 shrink-0" />,
  commented: <ChatOutline className="size-3.5 shrink-0" />,
  updated: <UpdatedAtOutline className="size-3.5 shrink-0" />,
  claimed: <LockOutline className="size-3.5 shrink-0" />,
  released: <UnlockedOutline className="size-3.5 shrink-0" />,
  holds: <LockOutline className="size-3.5 shrink-0" />,
  assigned: <UserPlusOutline className="size-3.5 shrink-0" />,
  delegated: <UserPlusOutline className="size-3.5 shrink-0" />,
};

const INBOX_ICON: Record<TAgentInboxKind, ReactNode> = {
  mention: <AtOutline className="size-3.5" />,
  comment: <ChatOutline className="size-3.5" />,
  assignment: <UserPlusOutline className="size-3.5" />,
  handover: <TransferWorkItemOutline className="size-3.5" />,
  answer: <CheckDoneOutline className="size-3.5" />,
};

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-3 text-12 text-tertiary">{children}</p>;
}

/** What the session did last: items it filed, completed, changed or commented on, and its claims. */
export function AgentRecentList({ slug, recent }: { slug: string; recent: TAgentPanelRecent[] }) {
  const { t } = useTranslation();
  if (recent.length === 0) return <Empty>{t("agents.page.recent_none")}</Empty>;
  return (
    <div className="px-3 pt-1.5 pb-2.5">
      {recent.map((entry) => (
        <div
          key={`${entry.kind}-${entry.item.id}-${entry.at}`}
          className="flex h-[26px] items-center gap-2 text-[12.5px] text-secondary"
        >
          {RECENT_ICON[entry.kind]}
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {t(`agents.page.recent.${entry.kind}`)}
            <AgentItemLink slug={slug} item={entry.item} className="text-[12px]" />
            {entry.kind === "updated" && entry.field && <span className="truncate text-tertiary">{entry.field}</span>}
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-tertiary">{agentAgo(t, entry.at)}</span>
        </div>
      ))}
    </div>
  );
}

/** What Plane told the session, newest first, and whether the session has taken it. */
export function AgentInboxList(props: { slug: string; inbox: TAgentPanelInboxEntry[]; limit?: number }) {
  const { slug, inbox, limit } = props;
  const { t } = useTranslation();
  if (inbox.length === 0) return <Empty>{t("agents.page.inbox_none")}</Empty>;
  const title = (entry: TAgentPanelInboxEntry) => {
    const who = entry.actor ?? entry.from_session?.name ?? t("agents.page.someone");
    return t(`agents.page.inbox.${entry.kind}`, { who });
  };
  return (
    <div className="px-3 pt-0.5 pb-2">
      {inbox.slice(0, limit).map((entry) => (
        <div
          key={entry.id}
          className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2.5 border-b border-subtle py-2 text-[12.5px] last:border-b-0"
        >
          <span className="grid size-[22px] place-items-center rounded-md bg-layer-2 text-secondary">
            {INBOX_ICON[entry.kind]}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{title(entry)}</span>
              {entry.item && <AgentItemLink slug={slug} item={entry.item} />}
            </span>
            {entry.body && <span className="line-clamp-2 text-secondary">{entry.body}</span>}
          </span>
          <span className="flex flex-col items-end gap-0.5 text-11 whitespace-nowrap text-tertiary">
            {entry.acked_at ? (
              <span className="flex items-center gap-1 text-success-primary">
                <CheckDoneOutline className="size-3" />
                {t("agents.page.acknowledged")}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning-primary">
                <ClockOutline className="size-3" />
                {t("agents.page.waiting")}
              </span>
            )}
            <span>
              {entry.queue ? `${t("agents.page.via_queue")} · ` : ""}
              {agentAgo(t, entry.at)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The items the session holds, each with when it claimed it. */
export function AgentHoldsList({ slug, holds }: { slug: string; holds: TAgentPanel["holds"] }) {
  const { t } = useTranslation();
  if (holds.length === 0) return <Empty>{t("agents.page.holds_none")}</Empty>;
  return (
    <div className="flex flex-col gap-3 px-3 py-2.5">
      {holds.map((hold) => (
        <div key={hold.id} className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <EpicStateIcon group={(hold.state_group as TStateGroups | null) ?? null} size="sm" />
            <AgentItemLink slug={slug} item={hold} className="text-12" />
          </span>
          <span className="text-13 font-medium">{hold.name}</span>
          <span className="text-12 text-secondary">
            {t("agents.page.claimed_note", { when: agentWhen(t, hold.claimed_at) })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Every item the session touched, and how. */
export function AgentItemsList({ slug, items }: { slug: string; items: TAgentPanel["items"] }) {
  const { t } = useTranslation();
  if (items.length === 0) return <Empty>{t("agents.page.items_none")}</Empty>;
  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex h-[34px] items-center gap-2.5 border-b border-subtle px-2.5 text-13 last:border-b-0"
        >
          <EpicStateIcon group={(item.state_group as TStateGroups | null) ?? null} size="sm" />
          <AgentItemLink slug={slug} item={item} className="w-[76px] text-[11.5px]" />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <span className="shrink-0 truncate text-[11.5px] text-tertiary">
            {item.roles.map((role) => t(`agents.page.role.${role}`)).join(", ")}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The session's claims, open and ended, with how each ended; a person can release an open one. */
export function AgentClaimsList(props: {
  slug: string;
  claims: TAgentPanel["claims"];
  onRelease?: (item: TAgentItemRef) => Promise<void>;
}) {
  const { slug, claims, onRelease } = props;
  const { t } = useTranslation();
  const [releasing, setReleasing] = useState<string | null>(null);
  const release = (item: TAgentItemRef) => {
    if (!onRelease) return;
    setReleasing(item.id);
    void onRelease(item).finally(() => setReleasing(null));
  };
  return (
    <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3 text-[12.5px]">
      {claims.length === 0 && <span className="text-12 text-tertiary">{t("agents.page.claims_none")}</span>}
      {claims.map((claim) => (
        <div key={`${claim.item.id}-${claim.claimed_at}`} className="flex items-center gap-2">
          {claim.ended_at ? (
            <UnlockedOutline className="size-3.5 shrink-0 text-tertiary" />
          ) : (
            <LockOutline className="size-3.5 shrink-0 text-warning-primary" />
          )}
          <AgentItemLink slug={slug} item={claim.item} className="text-[11.5px]" />
          <span className="min-w-0 truncate">
            {claim.ended_at
              ? t("agents.page.claim_ended", {
                  from: agentWhen(t, claim.claimed_at),
                  to: agentWhen(t, claim.ended_at),
                  reason: claim.end_reason ? t(`agents.page.claim_end.${claim.end_reason}`) : "",
                })
              : t("agents.page.claim_open", { when: agentWhen(t, claim.claimed_at) })}
          </span>
          {!claim.ended_at && onRelease && (
            // the propel Button takes no className, so its place in the row is the wrapper's
            <span className="ml-auto shrink-0">
              <Button
                variant="secondary"
                size="sm"
                stretch="auto"
                loading={releasing === claim.item.id}
                disabled={releasing !== null}
                onClick={() => release(claim.item)}
                label={t("agents.page.release")}
              />
            </span>
          )}
        </div>
      ))}
      <span className="text-[11.5px] text-tertiary">{t("agents.page.claim_lapses")}</span>
    </div>
  );
}

const SessionName = observer(function SessionName({
  session,
}: {
  session: TAgentSessionRef | { id: null; name: string };
}) {
  if (!session.id) return <span className="font-code text-[11.5px] text-secondary">{session.name}</span>;
  return <AgentSessionChip session={{ id: session.id, name: session.name }} size="sm" />;
});

/** Work handed over to the session, by it to a later one, and what still waits for a session. */
export function AgentHandoffsList({ slug, handoffs }: { slug: string; handoffs: TAgentPanel["handoffs"] }) {
  const { t } = useTranslation();
  const { received, given, waiting } = handoffs;
  if (received.length === 0 && !given && waiting.length === 0) return <Empty>{t("agents.page.handoffs_none")}</Empty>;
  const items = (list: TAgentItemRef[]) => list.map((item) => <AgentItemLink key={item.id} slug={slug} item={item} />);
  return (
    <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3 text-[12.5px]">
      {received.map((handover) => (
        <div key={handover.at} className="flex flex-wrap items-center gap-2">
          <TransferWorkItemOutline className="size-3.5 shrink-0 text-secondary" />
          {t("agents.page.handoff_received")}
          {items(handover.items)}
          {t("agents.page.handoff_from")}
          {handover.from_sessions.map((source) => (
            <SessionName
              key={source.name}
              session={source.id ? { ...source, id: source.id } : { id: null, name: source.name }}
            />
          ))}
          <span className="text-tertiary">{agentWhen(t, handover.at)}</span>
        </div>
      ))}
      {given && (
        <div className="flex flex-wrap items-center gap-2">
          <TransferWorkItemOutline className="size-3.5 shrink-0 text-secondary" />
          {t("agents.page.handoff_given")}
          {items(given.items)}
          {t("agents.page.handoff_to")}
          <SessionName session={given.to} />
        </div>
      )}
      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-warning-primary">
          <ClockOutline className="size-3.5 shrink-0" />
          {items(waiting)}
          {t("agents.page.handoff_waiting")}
        </div>
      )}
    </div>
  );
}
