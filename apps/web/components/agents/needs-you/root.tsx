/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Link, useSearchParams } from "react-router";
import {
  CheckDoneFilled,
  ChevronLeftOutline,
  ChevronRightOutline,
  ClockOutline,
  NewTabArrowOutline,
  ReplyOutline,
} from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { setToast } from "@plane/blocks/toast";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TAgentQuestion, TNeedsYouReview } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { Segmented } from "@/components/analytics/charts/cards";
import { AgentBox, AgentSessionFields, agentAgo } from "@/components/agents/page/parts";
import { AgentPlanChecklist } from "@/components/agents/steering/agent-feed";
import { AgentQuestionCard, SteeringSession, answerFieldId } from "@/components/agents/steering/question-card";
import {
  deadlineAt,
  refreshSteering,
  useIssueAgentOverview,
  useNeedsYou,
} from "@/components/agents/steering/use-steering";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// helpers
import { botFaceOf } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { IssueCommentService, IssueService } from "@/services/issue";

const issueService = new IssueService();
const commentService = new IssueCommentService();

type TShow = "all" | "questions" | "reviews";
type TEntry =
  | { key: string; kind: "question"; question: TAgentQuestion }
  | { key: string; kind: "review"; review: TNeedsYouReview };

const anOverlayIsOpen = () => !!document.querySelector("[role=dialog], [role=alertdialog], [role=menu]");

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );

const workItemOf = (entry: TEntry) => (entry.kind === "question" ? entry.question.work_item : entry.review.work_item);
const sessionOf = (entry: TEntry) => (entry.kind === "question" ? entry.question.session : entry.review.session);

/**
 * Needs you (r6-05, 2B): what waits for a person, newest first: questions from agents and the items they finished
 * into Review. The list beside the full context of the picked entry; on a phone each entry takes the screen.
 */
export const NeedsYouRoot = observer(function NeedsYouRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const { sidebarCollapsed } = useAppTheme();
  const { currentWorkspace } = useWorkspace();
  const { data, error } = useNeedsYou(workspaceSlug);
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState<TShow>("all");

  const entries = useMemo<TEntry[]>(() => {
    const questions: TEntry[] = (data?.questions ?? []).map((question) => ({
      key: `q:${question.id}`,
      kind: "question",
      question,
    }));
    const reviews: TEntry[] = (data?.reviews ?? []).map((review) => ({
      key: `r:${review.work_item.id}`,
      kind: "review",
      review,
    }));
    if (show === "questions") return questions;
    if (show === "reviews") return reviews;
    return [...questions, ...reviews];
  }, [data, show]);

  const wanted = params.get("entry");
  const picked = entries.find((entry) => entry.key === wanted);
  // a wide screen always shows one; a phone shows the list until an entry is opened
  const selected = picked ?? entries[0];

  const select = useCallback(
    (key: string | null) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (key) next.set("entry", key);
          else next.delete("entry");
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  // J and K move through the list, as in the frame's key line
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingInInput(event.target) || anOverlayIsOpen()) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const index = entries.findIndex((entry) => entry.key === selected?.key);
      const next = entries[Math.min(entries.length - 1, Math.max(0, index + (key === "j" ? 1 : -1)))];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      select(next.key);
    };
    // captured ahead of Power K's own single keys
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [entries, selected, select]);

  const counts = data?.counts ?? { questions: 0, reviews: 0, total: 0 };
  const questionEntries = entries.filter((entry) => entry.kind === "question");
  const reviewEntries = entries.filter((entry) => entry.kind === "review");

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 border-b border-strong px-[18px] pt-3 pb-3">
        <div className="flex min-h-7 items-center gap-2">
          {sidebarCollapsed && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            <span className="truncate">{currentWorkspace?.name}</span>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-primary">{t("agents.needs_you.title")}</span>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">
            {t("agents.needs_you.title")}
          </h1>
          <span className="rounded-[5px] bg-layer-2 px-[7px] text-12 leading-5 text-secondary tabular-nums">
            {counts.total}
          </span>
          <span className="hidden min-w-0 truncate text-13 text-secondary md:inline">
            {t("agents.needs_you.subtitle")}
          </span>
          <span className="flex-1" />
          <Segmented
            label={t("agents.needs_you.show_label")}
            value={show}
            onChange={setShow}
            options={(["all", "questions", "reviews"] as const).map((value) => ({
              value,
              label: `${t(`agents.needs_you.show.${value}`)} ${value === "all" ? counts.total : counts[value]}`,
            }))}
          />
        </div>
      </header>

      {error ? (
        <p className="p-6 text-13 text-secondary">{t("agents.needs_you.failed")}</p>
      ) : !data ? (
        <div className="flex flex-col gap-2 p-[18px]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-layer-2" />
          ))}
        </div>
      ) : !entries.length ? (
        <div className="flex flex-col items-center gap-1 py-20 text-center">
          <CheckDoneFilled className="size-6 text-success-primary" aria-hidden="true" />
          <p className="text-14 font-medium text-primary">{t("agents.needs_you.empty_title")}</p>
          <p className="text-13 text-secondary">{t("agents.needs_you.empty_description")}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label={t("agents.needs_you.list_label")}
            className={cn(
              "min-h-0 w-full shrink-0 overflow-y-auto border-r border-strong md:block md:w-[400px]",
              picked ? "hidden" : "block"
            )}
          >
            {questionEntries.length > 0 && (
              <EntryGroup label={t("agents.needs_you.questions_heading", { count: questionEntries.length })}>
                {questionEntries.map((entry) => (
                  <EntryButton
                    key={entry.key}
                    entry={entry}
                    selected={entry.key === selected?.key}
                    onSelect={() => select(entry.key)}
                  />
                ))}
              </EntryGroup>
            )}
            {reviewEntries.length > 0 && (
              <EntryGroup label={t("agents.needs_you.reviews_heading", { count: reviewEntries.length })}>
                {reviewEntries.map((entry) => (
                  <EntryButton
                    key={entry.key}
                    entry={entry}
                    selected={entry.key === selected?.key}
                    onSelect={() => select(entry.key)}
                  />
                ))}
              </EntryGroup>
            )}
          </nav>
          {selected && (
            <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto md:block", picked ? "block" : "hidden")}>
              <EntryDetail
                key={selected.key}
                workspaceSlug={workspaceSlug}
                entry={selected}
                onBack={() => select(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function EntryGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className="flex h-9 items-center px-[18px] text-10-5 font-semibold tracking-[0.08em] text-secondary uppercase">
        {label}
      </h2>
      <ul>{children}</ul>
    </section>
  );
}

function KindPill({ kind }: { kind: TEntry["kind"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-[10px] px-1.5 text-[11px] font-semibold",
        kind === "question" ? "bg-warning-subtle text-warning-primary" : "bg-success-subtle text-success-primary"
      )}
    >
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t(`agents.needs_you.kind.${kind}`)}
    </span>
  );
}

function EntryButton(props: { entry: TEntry; selected: boolean; onSelect: () => void }) {
  const { entry, selected, onSelect } = props;
  const { t } = useTranslation();
  const item = workItemOf(entry);
  const session = sessionOf(entry);
  const deadline = entry.kind === "question" ? entry.question.deadline : null;
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-1.5 border-b border-subtle px-[18px] py-3 text-left outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-inset",
          selected && "bg-layer-1-selected shadow-[inset_2px_0_0_var(--bg-accent-primary)]"
        )}
      >
        <span className="flex items-center gap-2">
          <KindPill kind={entry.kind} />
          <span className="font-code text-11 text-secondary">{item.identifier}</span>
        </span>
        <span className="line-clamp-2 text-13 font-medium text-primary">
          {entry.kind === "question" ? entry.question.question : item.name}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-12 text-secondary">
          {session?.bot && <BotAvatar name={session.bot.display_name} bot size={14} {...botFaceOf(session.harness)} />}
          <span className="min-w-0 truncate font-code text-[11.5px]">{session?.name}</span>
          <span className="flex-1" />
          {deadline ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-warning-primary">
              <ClockOutline className="size-3" aria-hidden="true" />
              {deadlineAt(t, deadline)}
            </span>
          ) : (
            <span className="shrink-0 text-tertiary">
              {agentAgo(t, entry.kind === "question" ? entry.question.asked_at : entry.review.at)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** The picked entry in full: the item, the question to answer or the review to close or send back, the plan and the session */
const EntryDetail = observer(function EntryDetail(props: { workspaceSlug: string; entry: TEntry; onBack: () => void }) {
  const { workspaceSlug, entry, onBack } = props;
  const { t } = useTranslation();
  const agent = useAgent();
  const { allowPermissions } = useUserPermissions();
  const item = workItemOf(entry);
  const session = sessionOf(entry);
  const { data: overview } = useIssueAgentOverview(workspaceSlug, item.project_id, item.id);
  const canAnswer = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    item.project_id
  );

  const sessionId = session?.id ?? null;
  useEffect(() => {
    if (sessionId) void agent.fetchSession(workspaceSlug, sessionId).catch(() => undefined);
  }, [agent, workspaceSlug, sessionId]);
  const fullSession = sessionId ? agent.getSessionById(sessionId) : undefined;

  // the plan of the session on this item: its claim's while it holds the item, else the last plan it reported
  const plan =
    overview?.claim && overview.claim.session.id === sessionId
      ? overview.claim.plan
      : (overview?.activity.find((activity) => activity.kind === "plan" && activity.session?.id === sessionId)?.data
          .steps ?? []);

  // a question takes the focus, so 1, 2, 3 pick its options and the field is a Tab away
  useEffect(() => {
    if (entry.kind !== "question") return;
    document.getElementById(answerFieldId(entry.question.id))?.closest("section")?.focus({ preventScroll: true });
  }, [entry]);

  return (
    <div className="flex flex-col gap-4 px-[22px] pt-4 pb-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-12 text-secondary hover:bg-layer-1-hover md:hidden"
        >
          <ChevronLeftOutline className="size-3.5" />
          {t("agents.needs_you.back")}
        </button>
        <span className="font-code text-12 text-secondary">{item.identifier}</span>
        <span className="flex-1" />
        <Link
          to={`/${workspaceSlug}/browse/${item.identifier}/`}
          className="flex h-7 items-center gap-1.5 rounded-md border border-strong bg-surface-1 px-2.5 text-12 font-medium text-primary hover:bg-layer-1-hover"
        >
          <NewTabArrowOutline className="size-3.5" />
          {t("agents.needs_you.open_item")}
        </Link>
      </div>
      <h2 className="text-[20px] leading-tight font-semibold text-primary">{item.name}</h2>

      {entry.kind === "question" ? (
        <AgentQuestionCard workspaceSlug={workspaceSlug} question={entry.question} canAnswer={canAnswer} showItem />
      ) : (
        <ReviewCard
          workspaceSlug={workspaceSlug}
          review={entry.review}
          canAct={canAnswer}
          reviewStateId={overview?.activity.find((activity) => activity.kind === "review")?.data.state_id}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        {plan.length > 0 && (
          <AgentBox label={t("agents.needs_you.plan_of", { session: session?.name ?? "" })}>
            <AgentPlanChecklist steps={plan} className="px-3 py-3" />
          </AgentBox>
        )}
        {fullSession && (
          <AgentBox label={t("agents.page.session_title")}>
            <AgentSessionFields session={fullSession} />
          </AgentBox>
        )}
      </div>
    </div>
  );
});

/** An item an agent finished into Review: close it, or send it back to In Progress with a comment (C and B) */
const ReviewCard = observer(function ReviewCard(props: {
  workspaceSlug: string;
  review: TNeedsYouReview;
  canAct: boolean;
  reviewStateId?: string;
}) {
  const { workspaceSlug, review, canAct, reviewStateId } = props;
  const { t } = useTranslation();
  const { fetchProjectStates, getProjectStates } = useProjectState();
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const { project_id: projectId, id: issueId } = review.work_item;

  // the comment field takes the focus as the send back form opens, by B or the button
  useEffect(() => {
    if (sendingBack) noteRef.current?.focus();
  }, [sendingBack]);

  useEffect(() => {
    void fetchProjectStates(workspaceSlug, projectId).catch(() => undefined);
  }, [fetchProjectStates, workspaceSlug, projectId]);

  const states = getProjectStates(projectId) ?? [];
  const bySequence = (group: string) => {
    const picked = states.filter((state) => state.group === group);
    // a fresh array, sorted in place
    // oxlint-disable-next-line unicorn/no-array-sort
    return picked.sort((a, b) => a.sequence - b.sequence);
  };
  // Review is a started state too: send back to the first started state that is not it
  const backTo = bySequence("started").find(
    (state) => state.id !== reviewStateId && state.name.toLowerCase() !== "review"
  );
  const closeTo = bySequence("completed")[0];

  const act = async (work: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      setToast({ type: "success", title: done });
      await refreshSteering(workspaceSlug, issueId);
    } catch (error) {
      setToast({
        type: "error",
        title: t("agents.needs_you.action_failed"),
        message: (error as { error?: string } | undefined)?.error,
      });
    } finally {
      setBusy(false);
    }
  };

  const close = () =>
    closeTo &&
    act(
      () => issueService.patchIssue(workspaceSlug, projectId, issueId, { state_id: closeTo.id }),
      t("agents.needs_you.closed", { item: review.work_item.identifier })
    );

  const sendBack = () =>
    backTo &&
    note.trim() &&
    act(
      async () => {
        await commentService.createIssueComment(workspaceSlug, projectId, issueId, {
          comment_html: `<p>${escapeHtml(note.trim())}</p>`,
        });
        await issueService.patchIssue(workspaceSlug, projectId, issueId, { state_id: backTo.id });
        setNote("");
        setSendingBack(false);
      },
      t("agents.needs_you.sent_back", { item: review.work_item.identifier, state: backTo.name })
    );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!canAct || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingInInput(event.target) || anOverlayIsOpen()) return;
      const key = event.key.toLowerCase();
      if (key !== "c" && key !== "b") return;
      // ahead of Power K, whose C creates a work item
      event.preventDefault();
      event.stopPropagation();
      if (key === "c") void close();
      else setSendingBack(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <section
      aria-label={t("agents.needs_you.review_label")}
      className="flex flex-col gap-3 rounded-xl border border-strong bg-surface-1 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-secondary">
        <KindPill kind="review" />
        <SteeringSession session={review.session} />
        <span>{t("agents.needs_you.finished_into_review")}</span>
        <span className="text-tertiary">· {agentAgo(t, review.at)}</span>
      </div>
      {review.summary && <p className="text-14 whitespace-pre-line text-primary">{review.summary}</p>}
      {canAct &&
        (sendingBack ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendBack();
            }}
            className="flex flex-col gap-2 rounded-lg border border-accent-strong p-2.5"
          >
            <span className="text-12 font-semibold text-primary">
              {t("agents.needs_you.send_back_title", { state: backTo?.name ?? "" })}
            </span>
            <textarea
              ref={noteRef}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void sendBack();
                }
              }}
              rows={3}
              aria-label={t("agents.needs_you.send_back_label")}
              placeholder={t("agents.needs_you.send_back_placeholder")}
              className="resize-y rounded-md bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            />
            <div className="flex items-center gap-2">
              <span className="text-11 text-tertiary">{t("agents.needs_you.send_back_note")}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setSendingBack(false)}
                className="h-7 rounded-md border border-strong px-2.5 text-12 text-primary hover:bg-layer-1-hover"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy || !note.trim() || !backTo}
                className="flex h-7 items-center gap-1.5 rounded-md bg-accent-primary px-2.5 text-12 font-semibold text-on-color hover:bg-accent-primary-hover disabled:opacity-50"
              >
                {t("agents.needs_you.send_back")}
                <kbd className="rounded-[4px] bg-white/20 px-1 font-code text-[10.5px]">⌘↵</kbd>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !closeTo}
              onClick={() => void close()}
              className="flex h-8 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-13 font-semibold text-on-color outline-none hover:bg-accent-primary-hover focus-visible:ring-2 focus-visible:ring-accent-strong disabled:opacity-50"
            >
              <CheckDoneFilled className="size-3.5" />
              {t("agents.needs_you.close")}
              <kbd className="rounded-[4px] bg-white/20 px-1 font-code text-[10.5px]">C</kbd>
            </button>
            <button
              type="button"
              disabled={busy || !backTo}
              onClick={() => setSendingBack(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-strong bg-surface-1 px-3 text-13 text-primary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong disabled:opacity-50"
            >
              <ReplyOutline className="size-3.5" />
              {t("agents.needs_you.send_back")}
              <kbd className="rounded-[4px] bg-layer-2 px-1 font-code text-[10.5px] text-secondary">B</kbd>
            </button>
          </div>
        ))}
    </section>
  );
});
