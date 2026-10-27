/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// the API the room asks whether the viewer may open the dashboard
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api.service", () => ({
  APIService: class {
    get = get;
  },
}));
vi.mock("@plane/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { authorizePresence, isPresenceRoom, parsePresenceRoom } from "@/lib/presence";

const DASHBOARD = "2f0c6a52-2c8e-4d7e-9a43-6a3f8f0d1b7e";
const ROOM = `presence:dashboard:${DASHBOARD}`;

describe("presence rooms", () => {
  // a block body: a function returned from beforeEach would run as its cleanup
  beforeEach(() => {
    get.mockReset();
  });

  it("names a dashboard's room and nothing else", () => {
    expect(parsePresenceRoom(ROOM)).toEqual({ kind: "dashboard", id: DASHBOARD });
    expect(parsePresenceRoom(`presence:page:${DASHBOARD}`)).toBeNull();
    expect(parsePresenceRoom("presence:dashboard:../../users/me")).toBeNull();
    expect(isPresenceRoom(ROOM)).toBe(true);
    // a page is still a page
    expect(isPresenceRoom(DASHBOARD)).toBe(false);
  });

  it("lets a viewer in when the API shows them the dashboard", async () => {
    get.mockResolvedValue({ data: { id: DASHBOARD } });
    const room = await authorizePresence({ documentName: ROOM, workspaceSlug: "gelhaus", cookie: "session=1" });
    expect(room).toEqual({ kind: "dashboard", id: DASHBOARD });
    expect(get).toHaveBeenCalledWith(`/api/workspaces/gelhaus/dashboards/${DASHBOARD}/`, {
      headers: { Cookie: "session=1" },
    });
  });

  it("refuses a viewer the API does not show the dashboard", async () => {
    get.mockRejectedValue(new Error("404"));
    await expect(
      authorizePresence({ documentName: ROOM, workspaceSlug: "gelhaus", cookie: "session=1" })
    ).rejects.toMatchObject({ code: "PRESENCE_REFUSED" });
  });

  it("refuses an unknown room or workspace without asking the API", async () => {
    const cases = [
      [`presence:page:${DASHBOARD}`, "gelhaus"],
      [ROOM, null],
      [ROOM, "../admin"],
    ] as const;
    await Promise.all(
      cases.map(([documentName, workspaceSlug]) =>
        expect(authorizePresence({ documentName, workspaceSlug, cookie: "session=1" })).rejects.toMatchObject({
          code: "PRESENCE_UNKNOWN_ROOM",
        })
      )
    );
    expect(get).not.toHaveBeenCalled();
  });
});
