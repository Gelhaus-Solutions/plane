/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { logger } from "@plane/logger";
import { AppError } from "@/lib/errors";
import { APIService } from "@/services/api.service";

/**
 * Presence rooms (PLANE-297): who has a screen open, shared through Yjs awareness on a document that is never saved.
 * A room is named `presence:<kind>:<id>`. Its connections are read-only, so the document stays empty, and a viewer is
 * let in only when the API shows them that screen.
 */
export type TPresenceRoom = { kind: "dashboard"; id: string };

const ROOM = /^presence:(dashboard):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const SLUG = /^[a-z0-9_-]+$/i;

export const isPresenceRoom = (documentName: string) => documentName.startsWith("presence:");

export const parsePresenceRoom = (documentName: string): TPresenceRoom | null => {
  const match = ROOM.exec(documentName);
  return match ? { kind: match[1] as TPresenceRoom["kind"], id: match[2] } : null;
};

class PresenceService extends APIService {
  /** Whether the API shows the viewer the screen the room is for */
  async canOpen(room: TPresenceRoom, workspaceSlug: string, cookie: string) {
    return this.get(`/api/workspaces/${workspaceSlug}/dashboards/${room.id}/`, { headers: { Cookie: cookie } })
      .then(() => true)
      .catch(() => false);
  }
}

/** Lets a viewer into a presence room, or throws when the room is unknown or not theirs to see */
export const authorizePresence = async ({
  documentName,
  workspaceSlug,
  cookie,
}: {
  documentName: string;
  workspaceSlug: string | null;
  cookie: string;
}) => {
  const room = parsePresenceRoom(documentName);
  if (!room || !workspaceSlug || !SLUG.test(workspaceSlug)) {
    throw new AppError("Unknown presence room", { code: "PRESENCE_UNKNOWN_ROOM" });
  }
  if (!(await new PresenceService().canOpen(room, workspaceSlug, cookie))) {
    logger.info(`Presence refused for ${documentName}`);
    throw new AppError("Not allowed in this presence room", { code: "PRESENCE_REFUSED" });
  }
  return room;
};
