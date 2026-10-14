/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { cn } from "@plane/utils";

describe("cn", () => {
  it("keeps an arbitrary font size next to a text colour", () => {
    expect(cn("text-[11.5px] text-secondary")).toBe("text-[11.5px] text-secondary");
    expect(cn("text-[12.5px] text-primary")).toBe("text-primary text-[12.5px]");
  });

  it("lets the later size or colour win", () => {
    expect(cn("text-13", "text-12")).toBe("text-12");
    expect(cn("text-[11px]", "text-13")).toBe("text-13");
    expect(cn("text-primary", "text-secondary")).toBe("text-secondary");
    expect(cn("text-primary", "text-(--txt-tertiary)")).toBe("text-(--txt-tertiary)");
  });

  it("treats typography as a size", () => {
    expect(cn("text-body-sm-medium", "text-13")).toBe("text-13");
    expect(cn("text-13", "text-body-sm-medium")).toBe("text-body-sm-medium");
    expect(cn("leading-5", "text-body-sm-medium")).toBe("text-body-sm-medium");
    expect(cn("text-body-sm-medium text-secondary")).toBe("text-body-sm-medium text-secondary");
  });
});
