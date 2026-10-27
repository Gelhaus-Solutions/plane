/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
// helpers
import { liveCollaborationURL } from "@/helpers/live.helper";
// hooks
import { useUser } from "@/hooks/store/user";

/**
 * Who else has a screen open (PLANE-297): the ids of the other people in a presence room on the live server, a
 * document that is never saved and carries only Yjs awareness. A room is `presence:<kind>:<id>`, and the live server
 * lets in only the viewers the API shows that screen. Only ids travel: names and faces come from the member store,
 * so nobody can show up under a name of their own making. Empty while it cannot connect.
 */
export function usePresence(room: string | undefined, workspaceSlug: string): string[] {
  const { data: currentUser } = useUser();
  const userId = currentUser?.id;
  const [present, setPresent] = useState<string[]>([]);

  useEffect(() => {
    if (!room || !userId || !workspaceSlug) return;
    const url = liveCollaborationURL({ workspaceSlug });
    if (!url) return;
    // the cookie goes with the WebSocket's own request, so the token only names the viewer
    const provider = new HocuspocusProvider({ url, name: room, token: JSON.stringify({ id: userId }) });
    const awareness = provider.awareness;
    if (!awareness) return () => provider.destroy();

    awareness.setLocalStateField("user", { id: userId });
    const onChange = () => {
      const ids = new Set<string>();
      awareness.getStates().forEach((state) => {
        const id = (state as { user?: { id?: unknown } }).user?.id;
        // another tab of your own is not someone else
        if (typeof id === "string" && id !== userId) ids.add(id);
      });
      // in the order they came; the same array while nobody came or went, so the head does not redraw
      setPresent((previous) =>
        previous.length === ids.size && previous.every((id) => ids.has(id)) ? previous : [...ids]
      );
    };
    awareness.on("change", onChange);

    return () => {
      awareness.off("change", onChange);
      provider.destroy();
      setPresent([]);
    };
  }, [room, userId, workspaceSlug]);

  return present;
}
