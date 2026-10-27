/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import {
  BulletedListOutline,
  ChatOutline,
  CheckDoneFilled,
  CircleOutline,
  GitCommitOutline,
  GitPullRequestOutline,
  TrendUpOutline,
  WarningTriangleOutline,
} from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAgentActivityEntry, TAgentActivityKind, TAgentPlanStep, TIssueAgentOverview } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { agentAgo } from "../page/parts";
import { AgentQuestionCard, SteeringSession } from "./question-card";

type TFilter = "status" | "plan" | "errors" | "code";

const FILTER_KINDS: Record<TFilter, TAgentActivityKind[]> = {
  status: ["status", "review", "progress"],
  plan: ["plan"],
  errors: ["error"],
  code: ["commit", "pull_request"],
};

/** A plan as a checklist: done steps ticked, the step in progress ringed */
export function AgentPlanChecklist({ steps, className }: { steps: TAgentPlanStep[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <ol className={cn("flex flex-col gap-1.5", className)}>
      {steps.map((step, index) => (
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index} className="flex min-w-0 items-center gap-2 text-13">
          {step.state === "done" ? (
            <CheckDoneFilled className="size-4 shrink-0 text-success-primary" aria-hidden="true" />
          ) : step.state === "doing" ? (
            <span
              aria-hidden="true"
              className="border-accent-primary grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]"
            >
              <i className="size-1.5 rounded-full bg-accent-primary" />
            </span>
          ) : (
            <CircleOutline className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          )}
          <span className={cn("min-w-0 flex-1 truncate", step.state === "done" ? "text-secondary" : "text-primary")}>
            {step.title}
          </span>
          {step.state === "doing" && (
            <span className="rounded-[5px] bg-accent-subtle px-1.5 text-[10.5px] font-semibold text-accent-primary">
              {t("agents.steering.now")}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

const ICON: Record<TAgentActivityKind, ReactNode> = {
  status: <i aria-hidden="true" className="size-2 rounded-full bg-success-primary" />,
  review: <CheckDoneFilled className="size-3.5 text-accent-primary" aria-hidden="true" />,
  progress: <TrendUpOutline className="size-3.5 text-secondary" aria-hidden="true" />,
  error: <WarningTriangleOutline className="size-3.5 text-danger-primary" aria-hidden="true" />,
  commit: <GitCommitOutline className="size-3.5 text-secondary" aria-hidden="true" />,
  pull_request: <GitPullRequestOutline className="size-3.5 text-secondary" aria-hidden="true" />,
  plan: <BulletedListOutline className="size-3.5 text-secondary" aria-hidden="true" />,
};

function FeedRow(props: { icon: ReactNode; title: ReactNode; at: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-2 border-b border-subtle py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2.5 text-13">
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-subtle">{props.icon}</span>
        <span className="min-w-0 flex-1 leading-5 text-primary">{props.title}</span>
        <span className="shrink-0 text-12 whitespace-nowrap text-tertiary">{agentAgo(t, props.at)}</span>
      </div>
      {props.children && <div className="pl-[30px]">{props.children}</div>}
    </li>
  );
}

/** An entry's kind and words; the session only when it is not the one holding the item, which the strip names. */
function EntryTitle({ entry, holderId }: { entry: TAgentActivityEntry; holderId: string | null }) {
  const { t } = useTranslation();
  const kind = (
    <span className={cn("font-semibold", entry.kind === "error" && "text-danger-primary")}>
      {t(`agents.steering.kind.${entry.kind}`)}
    </span>
  );
  let body: ReactNode = entry.text;
  if (entry.kind === "status" && entry.data.state && entry.data.state !== "working")
    body = [t(`agents.steering.claim_status.${entry.data.state}`), entry.text].filter(Boolean).join(": ");
  if (entry.kind === "review") body = entry.text || t("agents.steering.review_requested");
  const ref = entry.data.ref ? (
    entry.data.url ? (
      <a
        href={entry.data.url}
        target="_blank"
        rel="noreferrer"
        className="font-code text-accent-primary hover:underline"
      >
        {entry.data.ref}
      </a>
    ) : (
      <span className="font-code text-secondary">{entry.data.ref}</span>
    )
  ) : null;
  return (
    <>
      {kind}
      <span className="text-tertiary"> · </span>
      {ref}
      {ref && " "}
      {body}
      {entry.session && entry.session.id !== holderId && (
        <span className="ml-1.5 inline-flex align-middle">
          <SteeringSession session={entry.session} />
        </span>
      )}
    </>
  );
}

type Props = { workspaceSlug: string; overview: TIssueAgentOverview; canAnswer: boolean };

/**
 * The Agent tab of a work item (r6-08 3B): what the agents report, apart from people's comments, newest first, with
 * filters for status, plan, errors and code. Open questions lead, as cards to answer in place.
 */
export const AgentActivityFeed = observer(function AgentActivityFeed(props: Props) {
  const { workspaceSlug, overview, canAnswer } = props;
  const { t } = useTranslation();
  const [filters, setFilters] = useState<TFilter[]>([]);

  const kinds = new Set(filters.flatMap((filter) => FILTER_KINDS[filter]));
  const entries = overview.activity.filter((entry) => !filters.length || kinds.has(entry.kind));
  const open = overview.questions.filter((question) => question.status === "open");
  const settled = overview.questions.filter((question) => question.status !== "open");
  const showQuestions = !filters.length;
  const holderId = overview.claim?.session.id ?? null;

  const toggle = (filter: TFilter) =>
    setFilters((current) => (current.includes(filter) ? current.filter((f) => f !== filter) : [...current, filter]));

  // the questions people settled join the feed by when they were asked
  const rows: { at: string; node: ReactNode }[] = [
    ...entries.map((entry) => ({
      at: entry.created_at,
      node: (
        <FeedRow
          key={entry.id}
          icon={ICON[entry.kind]}
          title={<EntryTitle entry={entry} holderId={holderId} />}
          at={entry.created_at}
        >
          {entry.kind === "plan" && entry.data.steps?.length ? (
            <div className="rounded-lg border border-subtle bg-layer-1 px-3 py-2.5">
              <AgentPlanChecklist steps={entry.data.steps} />
            </div>
          ) : null}
        </FeedRow>
      ),
    })),
    ...(showQuestions ? settled : []).map((question) => ({
      at: question.asked_at,
      node: (
        <FeedRow
          key={question.id}
          icon={<ChatOutline className="size-3.5 text-secondary" aria-hidden="true" />}
          at={question.asked_at}
          title={
            <>
              <span className="font-semibold">{t("agents.steering.kind.question")}</span>
              <span className="text-tertiary"> · </span>
              {question.question}
            </>
          }
        >
          <AgentQuestionCard workspaceSlug={workspaceSlug} question={question} canAnswer={canAnswer} />
        </FeedRow>
      ),
    })),
  ];
  // a fresh array, sorted in place: newest first
  // oxlint-disable-next-line unicorn/no-array-sort
  rows.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("agents.steering.filters")} className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTER_KINDS) as TFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={filters.includes(filter)}
            onClick={() => toggle(filter)}
            className={cn(
              "h-6 rounded-md border px-2 text-12 outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
              filters.includes(filter)
                ? "border-accent-strong bg-accent-subtle text-primary"
                : "border-subtle text-secondary hover:bg-layer-1-hover"
            )}
          >
            {t(`agents.steering.filter.${filter}`)}
          </button>
        ))}
      </div>
      {showQuestions &&
        open.map((question) => (
          <AgentQuestionCard
            key={question.id}
            workspaceSlug={workspaceSlug}
            question={question}
            canAnswer={canAnswer}
          />
        ))}
      {rows.length ? (
        <ul className="flex flex-col">{rows.map((row) => row.node)}</ul>
      ) : (
        <p className="py-3 text-13 text-tertiary">{t("agents.steering.feed_empty")}</p>
      )}
      <p className="text-12 text-tertiary">{t("agents.steering.feed_note")}</p>
    </div>
  );
});
