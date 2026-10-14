/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { suggestCycleDates } from "@plane/utils";

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

describe("suggestCycleDates", () => {
  // Thursday, 15 October 2026
  const today = new Date(2026, 9, 15);

  it("starts on the next start weekday after the last cycle", () => {
    // the last cycle runs to Friday 23 October; the next Monday is 26 October
    const { start, end } = suggestCycleDates({ lastEnd: "2026-10-23", today, startDay: 0, lengthWeeks: 2 });
    expect([ymd(start), ymd(end)]).toEqual(["2026-10-26", "2026-11-08"]);
  });

  it("starts from today when the last cycle ended long ago or there is none", () => {
    expect(ymd(suggestCycleDates({ lastEnd: "2026-01-02", today, startDay: 0, lengthWeeks: 1 }).start)).toBe(
      "2026-10-19"
    );
    // Thursday is day 3, so today itself fits
    const { start, end } = suggestCycleDates({ today, startDay: 3, lengthWeeks: 1 });
    expect([ymd(start), ymd(end)]).toEqual(["2026-10-15", "2026-10-21"]);
  });

  it("runs for the project's number of weeks, starting on a Sunday too", () => {
    const { start, end } = suggestCycleDates({ lastEnd: "2026-10-17", today, startDay: 6, lengthWeeks: 4 });
    expect([ymd(start), ymd(end)]).toEqual(["2026-10-18", "2026-11-14"]);
  });
});
