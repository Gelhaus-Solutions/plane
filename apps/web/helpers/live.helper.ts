/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LIVE_BASE_PATH, LIVE_BASE_URL } from "@plane/constants";

/**
 * The live server's collaboration WebSocket address, with the query parameters it reads on connect: a page's editor
 * and a presence room both connect here. Web is a client-only app (`ssr: false` in react-router.config.ts), so there
 * is always a window. Undefined when the address cannot be built.
 */
export function liveCollaborationURL(params: Record<string, string | undefined>): string | undefined {
  try {
    const url = new URL(LIVE_BASE_URL?.trim() || window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss" : "ws";
    url.pathname = `${LIVE_BASE_PATH}/collaboration`;
    Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null)
      .forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    return url.toString();
  } catch (error) {
    console.error("Error creating the live server's address", error);
    return undefined;
  }
}
