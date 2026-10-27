/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import {
  ChatOutline,
  ClockOutline,
  CloseCircleOutline,
  EditOutline,
  MoreHorizontalOutline,
} from "@makeplane/propel/icons";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TAgentQuestion, TAgentSessionOrName } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { AgentSessionChip } from "@/components/agents/session-chip";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
// local imports
import { agentAgo, agentWhen } from "../page/parts";
import { deadlineAt, deadlineIn, defaultLabel, refreshSteering, steeringService } from "./use-steering";

/** The id of a question's answer field, for the banner's Answer button and the J/K keys of Needs you */
export const answerFieldId = (questionId: string) => `agent-question-answer-${questionId}`;

/** A session as its chip, or by name once it is gone */
export function SteeringSession({ session }: { session: TAgentSessionOrName | null }) {
  if (!session) return null;
  if (session.id === null) return <span className="font-code text-[11.5px] text-secondary">{session.name}</span>;
  return <AgentSessionChip session={session} size="sm" />;
}

const TONE = {
  open: "border-[color-mix(in_srgb,var(--txt-warning-primary)_55%,var(--border-strong))] bg-[color-mix(in_srgb,var(--txt-warning-primary)_6%,var(--bg-surface-1))]",
  closed: "border-strong bg-surface-1",
};

/** The question's standing as a small pill: Awaiting input in amber, the outcome otherwise */
export function QuestionStatusPill({ question }: { question: TAgentQuestion }) {
  const { t } = useTranslation();
  const open = question.status === "open";
  const key = question.corrected ? "corrected" : question.status;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[11px] px-2 text-[11.5px] font-semibold whitespace-nowrap",
        open ? "bg-warning-subtle text-warning-primary" : "bg-layer-2 text-secondary"
      )}
    >
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t(`agents.steering.question_status.${key}`)}
    </span>
  );
}

type Props = {
  workspaceSlug: string;
  question: TAgentQuestion;
  /** Whether the viewer may answer and withdraw (members and admins of the item's project) */
  canAnswer: boolean;
  /** Name the item the question is on, as Needs you does */
  showItem?: boolean;
};

/**
 * An agent's question on a work item (r6-12): the options with the default marked, an answer in your own words, and
 * what happens when nobody answers. A question whose default applied or whose deadline passed can still be answered;
 * the session gets that as a correction.
 */
export const AgentQuestionCard = observer(function AgentQuestionCard(props: Props) {
  const { workspaceSlug, question, canAnswer, showItem = false } = props;
  const { t, currentLocale } = useTranslation();
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const open = question.status === "open";
  const answerable = canAnswer && ["open", "defaulted", "expired"].includes(question.status);
  const fallback = defaultLabel(question);
  const shownChoice = picked ?? (open ? null : question.answer_option);

  const refresh = () => refreshSteering(workspaceSlug, question.work_item.id);
  const failed = (error: unknown) =>
    setToast({
      type: "error",
      title: t("agents.steering.answer_failed"),
      message: (error as { error?: string } | undefined)?.error,
    });

  const send = async () => {
    if (sending || (picked === null && !text.trim())) return;
    setSending(true);
    try {
      await steeringService.answerQuestion(workspaceSlug, question, {
        ...(picked !== null ? { option: picked } : {}),
        ...(text.trim() ? { text: text.trim() } : {}),
      });
      setPicked(null);
      setText("");
      setToast({ type: "success", title: t("agents.steering.answer_sent") });
      await refresh();
    } catch (error) {
      failed(error);
    } finally {
      setSending(false);
    }
  };

  const withdraw = async () => {
    try {
      await steeringService.withdrawQuestion(workspaceSlug, question);
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  // 1 to 9 pick an option while the card has the focus and nobody is typing
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!answerable || isTypingInInput(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const number = Number(event.key);
    if (Number.isInteger(number) && number >= 1 && number <= question.options.length) {
      event.preventDefault();
      setPicked((current) => (current === number ? null : number));
    }
  };

  return (
    <section
      aria-label={t("agents.steering.question_label")}
      // focusable, so the keys 1 to 9 reach it once Needs you puts the focus here
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn("flex flex-col gap-3 rounded-xl border p-4 outline-none", open ? TONE.open : TONE.closed)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-12 text-secondary">
        <ChatOutline className="size-3.5 shrink-0 text-warning-primary" aria-hidden="true" />
        <SteeringSession session={question.session} />
        <span>{showItem ? t("agents.steering.asks_on") : t("agents.steering.asks")}</span>
        {showItem && (
          <Link
            to={`/${workspaceSlug}/browse/${question.work_item.identifier}/`}
            className="flex min-w-0 items-center gap-1.5 hover:underline"
          >
            <span className="shrink-0 font-code text-11 text-secondary">{question.work_item.identifier}</span>
            <span className="truncate font-medium text-primary">{question.work_item.name}</span>
          </Link>
        )}
        <span className="text-tertiary">· {agentAgo(t, question.asked_at)}</span>
        <span className="flex-1" />
        <QuestionStatusPill question={question} />
        {open && canAnswer && (
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("agents.steering.question_menu")}
                  className="grid size-6 place-items-center rounded-md text-secondary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
                >
                  <MoreHorizontalOutline className="size-3.5" />
                </button>
              }
            />
            <MenuContent side="bottom" align="end">
              <MenuItem
                icon={<CloseCircleOutline />}
                label={t("agents.steering.withdraw")}
                onClick={() => void withdraw()}
              />
            </MenuContent>
          </Menu>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[15px] leading-snug font-semibold text-primary">{question.question}</p>
        {question.detail && <p className="text-13 whitespace-pre-line text-secondary">{question.detail}</p>}
      </div>

      {question.options.length > 0 && (
        <div role="group" aria-label={t("agents.steering.options")} className="flex flex-wrap gap-2">
          {question.options.map((option, index) => {
            const number = index + 1;
            const chosen = shownChoice === number;
            return (
              <button
                key={number}
                type="button"
                disabled={!answerable}
                aria-pressed={chosen}
                title={option.detail || undefined}
                onClick={() => setPicked((current) => (current === number ? null : number))}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg border px-2.5 text-13 text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-default",
                  chosen
                    ? "border-accent-strong bg-accent-subtle"
                    : "border-strong bg-surface-1 enabled:hover:bg-layer-1-hover"
                )}
              >
                <span className="text-11 text-tertiary tabular-nums">{number}</span>
                <span className="font-medium">{option.label}</span>
                {question.default_option === number && (
                  <span className="rounded-[5px] border border-subtle px-1 text-[10.5px] text-tertiary">
                    {t("agents.steering.default")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!open && <QuestionOutcome question={question} />}

      {answerable && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex h-10 items-center gap-2 rounded-lg border border-accent-strong bg-surface-1 pr-1.5 pl-3 focus-within:ring-2 focus-within:ring-accent-subtle"
        >
          <EditOutline className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
          <input
            id={answerFieldId(question.id)}
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder={open ? t("agents.steering.answer_placeholder") : t("agents.steering.correction_placeholder")}
            aria-label={t("agents.steering.answer_label")}
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
          />
          <button
            type="submit"
            disabled={sending || (picked === null && !text.trim())}
            className="flex h-7 items-center gap-1.5 rounded-md bg-accent-primary px-2.5 text-12 font-semibold text-on-color outline-none hover:bg-accent-primary-hover focus-visible:ring-2 focus-visible:ring-accent-strong disabled:opacity-50"
          >
            {t("agents.steering.send")}
            <kbd className="rounded-[4px] bg-white/20 px-1 font-code text-[10.5px]">↵</kbd>
          </button>
        </form>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-secondary">
          <span className="flex items-center gap-1.5">
            <ClockOutline className="size-3.5 shrink-0 text-warning-primary" aria-hidden="true" />
            {question.deadline
              ? fallback
                ? t("agents.steering.default_applies", { option: fallback, time: deadlineAt(t, question.deadline) })
                : t("agents.steering.decides_itself", { time: deadlineAt(t, question.deadline) })
              : t("agents.steering.no_deadline")}
            {question.deadline && deadlineIn(question.deadline, currentLocale) && (
              <span className="rounded-[5px] bg-warning-subtle px-1.5 text-11 text-warning-primary">
                {t("agents.steering.in", { time: deadlineIn(question.deadline, currentLocale) })}
              </span>
            )}
          </span>
          <span className="flex-1" />
          <span className="text-tertiary">{t("agents.steering.goes_to_session")}</span>
        </div>
      )}
    </section>
  );
});

/** What became of an answered, lapsed or withdrawn question */
function QuestionOutcome({ question }: { question: TAgentQuestion }) {
  const { t } = useTranslation();
  const option = question.answer_option ? question.options[question.answer_option - 1]?.label : "";
  const words = [option && `${question.answer_option}. ${option}`, question.answer_text].filter(Boolean).join(" · ");
  let line: string;
  switch (question.status) {
    case "answered":
      line = t(question.corrected ? "agents.steering.outcome.corrected" : "agents.steering.outcome.answered", {
        name: question.answered_by?.display_name ?? t("agents.page.someone"),
        when: agentWhen(t, question.answered_at),
      });
      break;
    case "defaulted":
      line = t("agents.steering.outcome.defaulted", { time: agentWhen(t, question.lapsed_at) });
      break;
    case "expired":
      line = t("agents.steering.outcome.expired", { time: agentWhen(t, question.lapsed_at) });
      break;
    default:
      line = t("agents.steering.outcome.cancelled");
  }
  return (
    <p className="text-13 text-secondary">
      {line}
      {words && <span className="font-medium text-primary"> {words}</span>}
    </p>
  );
}
