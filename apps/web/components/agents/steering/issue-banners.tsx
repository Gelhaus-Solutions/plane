/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { ChatOutline, WarningTriangleOutline } from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
import type { TAgentClaimStatus, TAgentQuestion, TIssueAgentOverview } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
// helpers
import { botFaceOf } from "@/helpers/agent.helper";
// local imports
import { STATUS_COLOR, agentAgo } from "../page/parts";
import { answerFieldId } from "./question-card";
import { deadlineAt, defaultLabel, useIssueAgentOverview } from "./use-steering";

/** The hash that opens a work item's Agent tab, so the strip and a link can point at it */
export const AGENT_TAB_HASH = "#agent";

export const openAgentTab = () => {
  if (window.location.hash === AGENT_TAB_HASH) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = AGENT_TAB_HASH;
};

const anOverlayIsOpen = () => !!document.querySelector("[role=dialog], [role=alertdialog], [role=menu]");

/** A claim's status as the frames draw it: a tinted pill, the dot pulsing while the agent works */
export function ClaimStatusPill({ status }: { status: TAgentClaimStatus }) {
  const { t } = useTranslation();
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[10px] px-2 text-[11px] font-semibold whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <i
        aria-hidden="true"
        className={cn("size-1.5 rounded-full bg-current", status === "working" && "animate-pulse")}
      />
      {t(`agents.steering.claim_status.${status}`)}
    </span>
  );
}

/** "Plan 3/5" with a small bar */
export function PlanProgress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation();
  if (!total) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-12 whitespace-nowrap text-secondary">
      {t("agents.steering.plan_short", { done, total })}
      <span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-layer-3">
        <span className="block h-full rounded-full bg-success-primary" style={{ width: `${(done / total) * 100}%` }} />
      </span>
    </span>
  );
}

/** "Claude · plane@1c0e9a4d is waiting for your answer" (r6-12), with A to answer it */
const QuestionBanner = observer(function QuestionBanner({ question }: { question: TAgentQuestion }) {
  const { t } = useTranslation();
  const who = question.session
    ? `${question.session.bot?.display_name ?? ""}${question.session.bot ? " · " : ""}${question.session.name}`
    : t("agents.page.someone");
  const fallback = defaultLabel(question);

  const answer = useCallback(() => {
    const field = document.getElementById(answerFieldId(question.id));
    if (!field) return;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }, [question.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "a" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || isTypingInInput(event.target) || anOverlayIsOpen()) return;
      // ahead of Power K, whose A assigns the item: while a question waits, A answers it
      event.preventDefault();
      event.stopPropagation();
      answer();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [answer]);

  return (
    <div
      role="status"
      className="mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--txt-warning-primary)_60%,var(--border-strong))] bg-warning-subtle px-3.5 py-2.5 text-13 sm:mx-[18px]"
    >
      <ChatOutline className="size-4 shrink-0 text-warning-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-primary">
        <span className="font-semibold">{t("agents.steering.banner_waiting", { who })}</span>{" "}
        {question.deadline &&
          (fallback
            ? t("agents.steering.default_applies", { option: fallback, time: deadlineAt(t, question.deadline) })
            : t("agents.steering.decides_itself", { time: deadlineAt(t, question.deadline) }))}
      </p>
      <button
        type="button"
        onClick={answer}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent-primary px-2.5 text-12 font-semibold text-on-color outline-none hover:bg-accent-primary-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
      >
        {t("agents.steering.answer")}
        <kbd className="rounded-[4px] bg-white/20 px-1 font-code text-[10.5px]">A</kbd>
      </button>
    </div>
  );
});

/** The status strip under the work item's header (r6-08 3B) while an agent holds the item */
const AgentStrip = observer(function AgentStrip({ overview }: { overview: TIssueAgentOverview }) {
  const { t } = useTranslation();
  const claim = overview.claim;
  if (!claim) return null;
  const errors = overview.activity.filter(
    (entry) => entry.kind === "error" && entry.created_at >= claim.claimed_at
  ).length;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-strong bg-layer-1 px-4 text-12 sm:px-[18px]">
      <BotAvatar
        name={claim.session.bot.display_name}
        bot
        working={claim.status === "working"}
        size={18}
        {...botFaceOf(claim.session.harness)}
      />
      <span className="shrink-0 font-code text-[11.5px] text-secondary">{claim.session.name}</span>
      <ClaimStatusPill status={claim.status} />
      <span className="min-w-0 flex-1 truncate text-primary">{claim.status_text}</span>
      <span className="hidden items-center gap-2.5 sm:flex">
        <PlanProgress done={claim.plan_summary.done} total={claim.plan_summary.total} />
        {errors > 0 && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-danger-primary">
            <WarningTriangleOutline className="size-3" aria-hidden="true" />
            {t("agents.steering.errors", { count: errors })}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-secondary">
          <i aria-hidden="true" className="size-1.5 rounded-full bg-success-primary" />
          {agentAgo(t, claim.status_at ?? claim.claimed_at)}
        </span>
      </span>
      <button
        type="button"
        onClick={openAgentTab}
        className="h-6 shrink-0 rounded-md border border-strong bg-surface-1 px-2 text-12 font-medium text-primary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
      >
        {t("agents.steering.agent_tab")}
      </button>
    </div>
  );
});

type Props = { workspaceSlug: string; projectId: string; issueId: string };

/** Above the work item: the banner while an agent waits for an answer, else the strip while one holds the item */
export const IssueAgentBanners = observer(function IssueAgentBanners(props: Props) {
  const { data } = useIssueAgentOverview(props.workspaceSlug, props.projectId, props.issueId);
  if (!data) return null;
  const open = data.questions.find((question) => question.status === "open");
  if (open) return <QuestionBanner question={open} />;
  return <AgentStrip overview={data} />;
});

/** "Awaiting input" beside the work item's type, while an agent's question waits */
export const IssueAwaitingInputBadge = observer(function IssueAwaitingInputBadge(props: Props) {
  const { t } = useTranslation();
  const { data } = useIssueAgentOverview(props.workspaceSlug, props.projectId, props.issueId);
  if (!data?.awaiting_input) return null;
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[11px] bg-warning-subtle px-2 text-12 font-semibold text-warning-primary">
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t("agents.steering.question_status.open")}
    </span>
  );
});
