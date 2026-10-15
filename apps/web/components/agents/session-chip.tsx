/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { SessionChip } from "@plane/blocks/session-chip";
import type { SessionChipProps } from "@plane/blocks/session-chip";
import type { TAgentSessionLite } from "@plane/types";
// components
import { AgentSessionHoverCard } from "@/components/agents/session-hover-card";
// helpers
import { harnessColor, harnessFromName } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";

type Props = Pick<SessionChipProps, "variant" | "size" | "showBot" | "className"> & {
  /** `chip` is the boxed Claude · plane@6995b6f5; `text` is only the session's name, in mono, for a byline. */
  appearance?: "chip" | "text";
  /** The session the chip names; the bot's name and harness are read from the store when it does not carry them. */
  session: Pick<TAgentSessionLite, "id" | "name"> & Partial<TAgentSessionLite>;
};

/** A session as a chip (Claude · plane@6995b6f5) that opens the session's card on hover (r6-11). */
export const AgentSessionChip = observer(function AgentSessionChip({ session, appearance = "chip", ...chip }: Props) {
  const agent = useAgent();
  const known = agent.getSessionById(session.id);
  const botName = session.bot?.display_name ?? known?.bot.display_name ?? "";
  const harness = session.harness ?? known?.harness ?? harnessFromName(botName);

  return (
    <AgentSessionHoverCard
      sessionId={session.id}
      trigger={
        appearance === "text" ? (
          <span className="cursor-default font-code text-[11.5px] text-secondary hover:text-primary">
            {session.name}
          </span>
        ) : (
          <span className="inline-flex max-w-full cursor-default">
            <SessionChip
              botName={botName}
              harness={harness}
              botColor={harnessColor(harness)}
              sessionName={session.name}
              {...chip}
            />
          </span>
        )
      }
    />
  );
});
