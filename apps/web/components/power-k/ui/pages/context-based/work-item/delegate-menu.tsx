/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect } from "react";
import { Command } from "cmdk";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { useTranslation } from "@plane/i18n";
import type { TIssue, TIssueAgentAssignment } from "@plane/types";
// components
import { useProjectBotIds } from "@/components/agents/use-project-bots";
// helpers
import { botFaceOf, shortDir } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useMember } from "@/hooks/store/use-member";
// local imports
import { PowerKModalCommandItem } from "../../../modal/command-item";

type Props = {
  handleSelect: (assignment: TIssueAgentAssignment) => void;
  workItemDetails: TIssue;
};

/** Shift D (r6-18): delegate the item to a bot, which is its queue, or to one of the bot's sessions. The item's
 * assignee stays on it and accountable; choosing the current delegate again takes it off. */
export const PowerKWorkItemDelegateMenu = observer(function PowerKWorkItemDelegateMenu(props: Props) {
  const { handleSelect, workItemDetails } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const agent = useAgent();
  const { getUserDetails } = useMember();
  const projectId = workItemDetails.project_id ?? undefined;
  const botIds = useProjectBotIds(projectId);
  const slug = workspaceSlug?.toString() ?? "";

  // the sessions and the item's agents are fresh each time the menu opens
  useEffect(() => {
    if (!slug || !projectId) return;
    void agent.fetchPickableSessions(slug).catch(() => undefined);
    void agent.fetchIssueAgents(slug, projectId, workItemDetails.id).catch(() => undefined);
  }, [agent, slug, projectId, workItemDetails.id]);

  const rows = agent.getIssueAgents(workItemDetails.id);
  // an agent that is the assignee is not delegated to: it works for itself
  const assigned = new Set(rows.filter((row) => !row.delegated).map((row) => row.bot.id));
  const delegated = new Map(rows.filter((row) => row.delegated).map((row) => [row.bot.id, row]));

  return (
    <Command.Group>
      {botIds
        .filter((botId) => !assigned.has(botId))
        .map((botId) => {
          const name = getUserDetails(botId)?.display_name ?? "";
          const row = delegated.get(botId);
          const sessionId = row?.state === "session" ? row.session?.id : undefined;
          return (
            <Fragment key={botId}>
              <PowerKModalCommandItem
                value={`bot-${botId}`}
                keywords={[name]}
                iconNode={<BotAvatar name={name} bot {...botFaceOf(agent.getBotHarness(botId, name))} size={16} />}
                label={name}
                sub={t("agents.picker.queue_hint")}
                isSelected={!!row && !sessionId}
                onSelect={() => handleSelect({ bot: botId, delegate: true })}
              />
              {agent.getBotSessions(botId).map((session) => (
                <PowerKModalCommandItem
                  key={session.id}
                  value={`session-${session.id}`}
                  keywords={[name, session.name, session.primary_dir]}
                  iconNode={<span className="size-4 shrink-0" />}
                  label={<span className="font-code">{session.name}</span>}
                  sub={shortDir(session.primary_dir)}
                  isSelected={sessionId === session.id}
                  onSelect={() => handleSelect({ session: session.id, delegate: true })}
                />
              ))}
            </Fragment>
          );
        })}
    </Command.Group>
  );
});
