/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { Badge } from "@makeplane/propel/components/badge";
import { NewTabArrowOutline } from "@makeplane/propel/icons";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
import { calculateTimeAgo, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { AgentStatusBadge } from "@/components/agents/status-badge";
// helpers
import { botFaceOf, displayStatusOf, harnessLabelKey, shortDir } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";

type Props = {
  sessionId: string;
};

/** The card a session chip opens (r6-11): where the session runs, how long, and what it holds. */
export const AgentSessionCard = observer(function AgentSessionCard({ sessionId }: Props) {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  const agent = useAgent();
  const [failed, setFailed] = useState(false);
  const session = agent.getSessionById(sessionId);

  // the card always asks again: a session's standing and what it holds change while its chip stays
  useEffect(() => {
    if (!slug) return;
    setFailed(false);
    void agent.fetchSession(slug, sessionId).catch(() => setFailed(true));
  }, [agent, slug, sessionId]);

  if (!session) {
    return (
      <p className="w-72 px-1 py-2 text-12 text-tertiary">
        {failed ? t("agents.card.not_found") : t("agents.card.loading")}
      </p>
    );
  }

  const status = displayStatusOf(session);
  const face = botFaceOf(session.harness);
  const rows: [string, string, boolean][] = [
    [
      t("agents.card.harness"),
      `${t(harnessLabelKey(session.harness))}${session.harness_version ? ` ${session.harness_version}` : ""}`,
      false,
    ],
    [t("agents.card.model"), session.model, true],
    [t("agents.card.primary_dir"), shortDir(session.primary_dir), true],
    [t("agents.card.host"), session.host, true],
    [t("agents.card.branch"), session.git_branch, true],
  ];

  return (
    <div className="flex w-[22rem] flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <BotAvatar name={session.bot.display_name} bot working={status === "working"} size={36} {...face} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-13 font-semibold text-primary">{session.bot.display_name}</span>
            <Badge variant="purple" size="xs" label={t("agents.bot")} />
          </div>
          <div className="truncate font-code text-12 text-secondary">{session.name}</div>
        </div>
        <AgentStatusBadge status={status} />
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-3 gap-y-1.5 text-12">
        {rows
          .filter(([, value]) => value)
          .map(([label, value, mono]) => (
            <div key={label} className="contents">
              <dt className="text-tertiary">{label}</dt>
              <dd className={mono ? "truncate font-code text-primary" : "truncate text-primary"}>{value}</dd>
            </div>
          ))}
        <dt className="text-tertiary">{t("agents.card.started")}</dt>
        <dd className="text-primary">
          {renderFormattedDate(session.started_at)}, {renderFormattedTime(session.started_at)}
        </dd>
        <dt className="text-tertiary">{t("agents.card.last_seen")}</dt>
        <dd className="text-primary">{calculateTimeAgo(session.last_seen_at)}</dd>
        <dt className="text-tertiary">{t("agents.card.ended")}</dt>
        <dd className={session.ended_at ? "text-primary" : "text-tertiary"}>
          {session.ended_at
            ? `${renderFormattedDate(session.ended_at)}, ${renderFormattedTime(session.ended_at)}`
            : t("agents.card.still_live")}
        </dd>
      </dl>
      <div className="flex items-center gap-2 border-t border-subtle pt-2.5">
        <span className="text-12 text-tertiary">{t("agents.card.holds")}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {session.holds.length === 0 ? (
            <span className="text-12 text-tertiary">{t("agents.card.holds_nothing")}</span>
          ) : (
            session.holds.map((hold) => (
              <Link
                key={hold.id}
                to={`/${slug}/browse/${hold.identifier}/`}
                title={hold.name}
                className="font-code text-12 text-primary hover:underline"
              >
                {hold.identifier}
              </Link>
            ))
          )}
        </div>
        <Link
          to={`/${slug}/agents/?${session.status === "ended" ? "tab=history&" : ""}panel=${session.id}`}
          className="flex shrink-0 items-center gap-1 text-12 font-medium text-accent-primary hover:underline"
        >
          <NewTabArrowOutline className="size-3" />
          {t("agents.card.open_session")}
        </Link>
      </div>
    </div>
  );
});
