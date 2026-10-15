/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { CloseOutline, CopyOutline } from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import { cn, copyTextToClipboard } from "@plane/utils";
// helpers
import { botFaceOf, displayStatusOf } from "@/helpers/agent.helper";
// local imports
import { AgentBox, AgentHeartbeat, AgentSessionFields, AgentStatusPill, BotBadge, Count, agentByline } from "./parts";
import { AgentClaimsList, AgentHandoffsList, AgentInboxList, AgentItemsList } from "./sections";
import { AgentStatusLine, usePanel } from "./session-detail";

type TSection = "overview" | "items" | "claims" | "handoffs" | "inbox";

type Props = { slug: string; sessionId: string; onClose: () => void };

/** The session panel (r6-10): everything about one session, over the page, from the right. */
export const AgentSessionPanel = observer(function AgentSessionPanel({ slug, sessionId, onClose }: Props) {
  const { t } = useTranslation();
  const { panel, failed } = usePanel(slug, sessionId);
  const [section, setSection] = useState<TSection>("overview");

  useEffect(() => setSection("overview"), [sessionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = panel ? `${panel.bot.display_name} · ${panel.name}` : t("agents.card.loading");

  const copyName = () => {
    if (!panel) return;
    void copyTextToClipboard(panel.name).then(() =>
      setToast({ type: "success", title: t("agents.panel.copied", { name: panel.name }) })
    );
  };

  const shell = (children: ReactNode) => (
    <aside
      aria-label={t("agents.panel.label", { session: label })}
      className="absolute inset-y-0 right-0 z-20 flex w-[640px] max-w-full flex-col border-l border-strong bg-surface-1 shadow-[-24px_0_48px_rgba(0,0,0,0.28)]"
    >
      {children}
    </aside>
  );

  if (!panel) {
    return shell(
      <div className="flex items-center justify-between px-4 py-3.5 text-12 text-tertiary">
        {failed ? t("agents.card.not_found") : t("agents.card.loading")}
        <button type="button" aria-label={t("agents.panel.close")} onClick={onClose} className="text-secondary">
          <CloseOutline className="size-4" />
        </button>
      </div>
    );
  }

  const status = displayStatusOf(panel);
  const handoffCount = panel.handoffs.received.length + (panel.handoffs.given ? 1 : 0) + panel.handoffs.waiting.length;
  const sections: { key: TSection; count?: number }[] = [
    { key: "overview" },
    { key: "items", count: panel.items.length },
    { key: "claims", count: panel.claims.length },
    { key: "handoffs", count: handoffCount },
    { key: "inbox", count: panel.inbox.length },
  ];
  const show = (key: TSection) => section === "overview" || section === key;

  return shell(
    <>
      <div className="flex items-center gap-2.5 border-b border-subtle px-4 pt-3.5 pb-2.5">
        <BotAvatar
          name={panel.bot.display_name}
          bot
          working={status === "working"}
          size={36}
          {...botFaceOf(panel.harness)}
        />
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2 text-15 font-semibold">
            {panel.bot.display_name}
            <span className="truncate font-code font-medium text-secondary">{panel.name}</span>
            <BotBadge />
          </span>
          <span className="truncate text-12 text-tertiary">{agentByline(t, panel, false)}</span>
        </div>
        <span className="flex-1" />
        <AgentStatusPill status={status} />
        <button
          type="button"
          aria-label={t("agents.panel.copy_name")}
          title={t("agents.panel.copy_name")}
          onClick={copyName}
          className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <CopyOutline className="size-4" />
        </button>
        <button
          type="button"
          aria-label={t("agents.panel.close")}
          title={t("agents.panel.close")}
          onClick={onClose}
          className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <CloseOutline className="size-4" />
        </button>
      </div>
      <nav
        aria-label={t("agents.panel.sections")}
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-strong px-2.5"
      >
        {sections.map(({ key, count }) => (
          <button
            key={key}
            type="button"
            aria-current={section === key ? "page" : undefined}
            onClick={() => setSection(key)}
            className={cn(
              "relative flex h-[38px] items-center gap-1.5 px-2.5 text-13 font-medium whitespace-nowrap text-secondary hover:text-primary",
              section === key &&
                "text-primary after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-primary"
            )}
          >
            {t(`agents.panel.section.${key}`)}
            {count !== undefined && count > 0 && <Count>{count}</Count>}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-4 pt-3.5 pb-6">
        {section === "overview" && (
          <>
            <div className="rounded-[10px] border border-strong bg-surface-2 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <AgentStatusPill status={status} />
                <span className="min-w-0 truncate text-13">
                  <AgentStatusLine session={panel} />
                </span>
                <span className="flex-1" />
                <AgentHeartbeat at={panel.last_seen_at} status={status} />
              </div>
            </div>
            <AgentBox label={t("agents.page.session_title")}>
              <AgentSessionFields
                session={panel}
                extra={[
                  [t("agents.panel.token"), t(`agents.panel.token_${panel.status === "ended" ? "revoked" : "live"}`)],
                ]}
              />
            </AgentBox>
          </>
        )}
        {show("items") && (
          <AgentBox label={t("agents.panel.items_title")} count={panel.items.length}>
            <AgentItemsList slug={slug} items={panel.items} />
          </AgentBox>
        )}
        {show("claims") && (
          <AgentBox label={t("agents.panel.section.claims")}>
            <AgentClaimsList slug={slug} claims={panel.claims} />
          </AgentBox>
        )}
        {show("handoffs") && (
          <AgentBox label={t("agents.panel.section.handoffs")} count={handoffCount}>
            <AgentHandoffsList slug={slug} handoffs={panel.handoffs} />
          </AgentBox>
        )}
        {show("inbox") && (
          <AgentBox label={t("agents.page.inbox_title")} count={panel.inbox.length}>
            <AgentInboxList slug={slug} inbox={panel.inbox} />
          </AgentBox>
        )}
      </div>
    </>
  );
});
