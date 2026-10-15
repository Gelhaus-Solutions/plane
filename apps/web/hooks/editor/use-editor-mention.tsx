/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useParams } from "next/navigation";
// plane editor
import { Avatar } from "@makeplane/propel/components/avatar";
import { BotAvatar } from "@plane/blocks/bot-avatar";
import type { TMentionSection, TMentionSuggestion } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
// plane types
import type { TSearchEntities, TSearchEntityRequestPayload, TSearchResponse, TUserSearchResponse } from "@plane/types";
// helpers
import { getFileURL } from "@plane/utils";
// helpers
import { botFaceOf, displayStatusOf, shortDir } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useMember } from "@/hooks/store/use-member";
// plane web hooks
import { useAdditionalEditorMention } from "@/hooks/use-additional-editor-mention";

type TArgs = {
  enableAdvancedMentions?: boolean;
  searchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
};

export const useEditorMention = (args: TArgs) => {
  const { enableAdvancedMentions = false, searchEntity } = args;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const agent = useAgent();
  const { getUserDetails } = useMember();
  // additional mentions
  const { editorMentionTypes, updateAdditionalSections } = useAdditionalEditorMention({
    enableAdvancedMentions,
  });
  // fetch mentions handler
  const fetchMentions = useCallback(
    async (query: string): Promise<TMentionSection[]> => {
      try {
        // `Claude/plane` names a session of Claude: the part before the slash finds the bot, the rest its sessions
        const [botQuery, sessionQuery] = query.split("/", 2);
        const res = await searchEntity({
          count: 5,
          query_type: editorMentionTypes,
          query: botQuery ?? query,
        });
        const suggestionSections: TMentionSection[] = [];
        const botUsers: TUserSearchResponse[] = [];
        if (!res) {
          throw new Error("No response found");
        }
        Object.keys(res).map((key) => {
          const responseKey = key as TSearchEntities;
          const response = res[responseKey];
          if (responseKey === "user_mention" && response && response.length > 0) {
            const users = response as TUserSearchResponse[];
            // an agent bot is offered with its sessions in its own section, not among the people
            const people = users.filter((user) => !getUserDetails(user.member__id)?.is_bot);
            const bots = users.filter((user) => getUserDetails(user.member__id)?.is_bot);
            if (bots.length > 0) botUsers.push(...bots);
            const items: TMentionSuggestion[] = (sessionQuery === undefined ? people : []).map((user) => ({
              icon: (
                <Avatar
                  alt={user.member__display_name}
                  fallback={user.member__display_name?.[0]?.toUpperCase()}
                  src={getFileURL(user.member__avatar_url)}
                  size="xs"
                />
              ),
              id: user.member__id,
              entity_identifier: user.member__id,
              entity_name: "user_mention",
              title: user.member__display_name,
            }));
            if (items.length > 0) suggestionSections.push({ key: "users", title: "Users", items });
          }
        });
        if (botUsers.length > 0) {
          const slug = workspaceSlug?.toString() ?? "";
          if (slug) await agent.fetchPickableSessions(slug).catch(() => undefined);
          const botItems: TMentionSuggestion[] = [];
          const lowered = sessionQuery?.trim().toLowerCase();
          for (const bot of botUsers) {
            const harness = agent.getBotHarness(bot.member__id, bot.member__display_name);
            const face = botFaceOf(harness);
            const icon = <BotAvatar name={bot.member__display_name} bot size={20} {...face} />;
            // the bot alone is its queue
            if (sessionQuery === undefined) {
              botItems.push({
                icon,
                id: bot.member__id,
                entity_identifier: bot.member__id,
                entity_name: "user_mention",
                title: `@${bot.member__display_name}`,
                description: t("agents.mention.queue", { name: bot.member__display_name }),
              });
            }
            for (const session of agent.getBotSessions(bot.member__id)) {
              if (lowered && !`${session.name} ${session.primary_dir}`.toLowerCase().includes(lowered)) continue;
              const status = t(`agents.status.${displayStatusOf(session)}`);
              const held = session.holds[0];
              botItems.push({
                icon,
                id: `session-${session.id}`,
                entity_identifier: session.id,
                entity_name: "agent_session_mention",
                title: `@${bot.member__display_name}/${session.name}`,
                description: held
                  ? `${status} · ${t("agents.mention.holds", { identifier: held.identifier })}`
                  : `${status} · ${shortDir(session.primary_dir)}`,
              });
            }
          }
          if (botItems.length > 0) {
            suggestionSections.push({ key: "bots", title: t("agents.mention.section"), items: botItems });
          }
        }
        const { sections } = updateAdditionalSections({
          response: res,
        });
        return [...suggestionSections, ...sections];
      } catch (error) {
        console.error("Error in fetching mentions:", error);
        throw error;
      }
    },
    [agent, editorMentionTypes, getUserDetails, searchEntity, t, updateAdditionalSections, workspaceSlug]
  );

  return {
    fetchMentions,
  };
};

/** What a mention chip says in plain text (an export, a copy): a person's name, or `Claude/plane@6995b6f5` for a
 * session. */
export const useMentionedEntityDetails = () => {
  const { getUserDetails } = useMember();
  const agent = useAgent();
  return useCallback(
    (id: string) => {
      const user = getUserDetails(id);
      if (user) return { display_name: user.display_name };
      const session = agent.getSessionById(id);
      if (session) return { display_name: `${session.bot.display_name}/${session.name}` };
      return { display_name: "" };
    },
    [agent, getUserDetails]
  );
};
