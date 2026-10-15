/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactElement } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
// components
import { AgentSessionCard } from "@/components/agents/session-card";

type Props = {
  sessionId: string;
  /** What the pointer rests on to open the card: a chip, a name, a mention. */
  trigger: ReactElement;
};

/** Anything that names a session opens the session's card on hover (r6-11). */
export function AgentSessionHoverCard({ sessionId, trigger }: Props) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={150} nativeButton={false} render={trigger} />
      <PopoverContent variant="rich" side="bottom" align="start" sideOffset={8}>
        <AgentSessionCard sessionId={sessionId} />
      </PopoverContent>
    </Popover>
  );
}
