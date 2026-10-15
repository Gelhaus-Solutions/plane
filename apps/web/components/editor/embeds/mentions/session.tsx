/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
// components
import { AgentSessionHoverCard } from "@/components/agents/session-hover-card";
// helpers
import { botFaceOf } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";

type Props = {
  id: string;
};

/** A mention of one session of an agent bot, `@Claude/plane@6995b6f5`: it reaches that session; the card opens on
 * hover. */
export const EditorSessionMention = observer(function EditorSessionMention({ id }: Props) {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const agent = useAgent();
  const session = agent.getSessionById(id);

  // a session the page has not met yet (an older comment) is asked for once
  useEffect(() => {
    if (!session && slug) void agent.fetchSession(slug, id).catch(() => undefined);
  }, [agent, session, slug, id]);

  const label = session ? `@${session.bot.display_name}/${session.name}` : "@session";
  return (
    <AgentSessionHoverCard
      sessionId={id}
      trigger={
        <span className="not-prose inline-flex items-center gap-1 rounded-sm bg-accent-subtle-active px-1 py-0.5 align-baseline text-accent-primary no-underline">
          {session && <BotAvatar name={session.bot.display_name} bot size={14} {...botFaceOf(session.harness)} />}
          <span>{label}</span>
        </span>
      }
    />
  );
});
