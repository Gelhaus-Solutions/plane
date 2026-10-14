/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BotAvatar, initialsOf } from "../bot-avatar";
import { PriorityIcon } from "../icons/priority-icon";
import { StateGroupIcon } from "../icons/state/state-group-icon";
import { piePath } from "../icons/state/pulse-state-svg";
import { LabelChip, labelPaletteColor } from "../label-chip";
import { PROJECT_BADGE_COLORS, ProjectBadge, projectBadgeColor } from "../project-badge";
import { SessionChip } from "../session-chip";
import { StateLozenge } from "../state-lozenge";

describe("state icons", () => {
  it("draws the half pie of a started state as in the design", () => {
    expect(piePath(0.5)).toBe("M7 7V3.6A3.4 3.4 0 0 1 7.000 10.400Z");
  });

  it("draws three quarters with the large arc flag", () => {
    expect(piePath(0.75)).toBe("M7 7V3.6A3.4 3.4 0 1 1 3.600 7.000Z");
  });

  it("takes each group's colour from its token and ignores a state's own colour", () => {
    const { container } = render(
      <>
        <StateGroupIcon stateGroup="backlog" color="#ff0000" />
        <StateGroupIcon stateGroup="unstarted" />
        <StateGroupIcon stateGroup="started" />
        <StateGroupIcon stateGroup="completed" />
        <StateGroupIcon stateGroup="cancelled" />
        <StateGroupIcon stateGroup="started" review />
      </>
    );
    const classes = [...container.querySelectorAll("svg")].map((svg) => svg.getAttribute("class"));
    expect(classes[0]).toContain("text-icon-states-backlog");
    expect(classes[1]).toContain("text-icon-states-unstarted");
    expect(classes[2]).toContain("text-icon-states-started");
    expect(classes[3]).toContain("text-icon-states-completed");
    expect(classes[4]).toContain("text-icon-states-cancelled");
    expect(classes[5]).toContain("text-state-started-2");
    expect(container.querySelector("svg")?.getAttribute("color")).toBeNull();
  });

  it("fills a started pie by its percentage and a review state three quarters", () => {
    const { container } = render(
      <>
        <StateGroupIcon stateGroup="started" percentage={25} />
        <StateGroupIcon stateGroup="started" review />
      </>
    );
    const [quarter, review] = [...container.querySelectorAll("svg path")].map((path) => path.getAttribute("d"));
    expect(quarter).toBe(piePath(0.25));
    expect(review).toBe(piePath(0.75));
  });
});

describe("PriorityIcon", () => {
  const lit = (priority: Parameters<typeof PriorityIcon>[0]["priority"]) => {
    const { container } = render(<PriorityIcon priority={priority} />);
    return [...container.querySelectorAll("rect")].map((bar) => bar.getAttribute("opacity"));
  };

  it("lights one, two or three bars", () => {
    expect(lit("low")).toEqual(["1", "0.28", "0.28"]);
    expect(lit("medium")).toEqual(["1", "1", "0.28"]);
    expect(lit("high")).toEqual(["1", "1", "1"]);
    expect(lit("none")).toEqual(["0.28", "0.28", "0.28"]);
    expect(lit(undefined)).toEqual(["0.28", "0.28", "0.28"]);
  });

  it("draws urgent as one orange square", () => {
    const { container } = render(<PriorityIcon priority="urgent" />);
    expect(container.querySelectorAll("rect")).toHaveLength(1);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-priority-urgent");
  });
});

describe("StateLozenge", () => {
  it("shows the name on the group's tint, with the group's icon", () => {
    const { container, getByText } = render(<StateLozenge kind="review">In Review</StateLozenge>);
    const lozenge = getByText("In Review");
    expect(lozenge.className).toContain("bg-loz-review-bg");
    expect(lozenge.className).toContain("uppercase");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-current");
  });
});

describe("LabelChip", () => {
  it("is a dot in the label's colour and its name", () => {
    const { container, getByText } = render(<LabelChip name="api" color={labelPaletteColor("blue")} />);
    expect(getByText("api")).toBeTruthy();
    expect((container.querySelector("span span") as HTMLElement).style.backgroundColor).toBe("var(--label-blue)");
  });
});

describe("BotAvatar", () => {
  it("makes initials from a name", () => {
    expect(initialsOf("Enno Gelhaus")).toBe("EG");
    expect(initialsOf("Claude")).toBe("CL");
    expect(initialsOf("  ")).toBe("");
  });

  it("is a circle with initials for a person and a rounded square for a bot", () => {
    const { getByTitle } = render(
      <>
        <BotAvatar name="Enno Gelhaus" size={24} />
        <BotAvatar name="Claude" bot harness="claude-code" size={24} />
      </>
    );
    const person = getByTitle("Enno Gelhaus");
    expect(person.textContent).toBe("EG");
    expect(person.className).toContain("rounded-full");
    const bot = getByTitle("Claude, bot");
    expect(bot.style.borderRadius).toBe("7px");
    expect(bot.querySelector("svg")).toBeTruthy();
  });

  it("wraps a working bot in the turning ring", () => {
    const { getByTitle } = render(<BotAvatar name="Claude" bot working />);
    const ring = getByTitle("Claude, bot, working").parentElement as HTMLElement;
    expect(ring.className).toContain("before:animate-pulse-ring");
  });
});

describe("SessionChip", () => {
  it("reads Claude · plane@6995b6f5 and tints a claim", () => {
    const { container, getAllByText } = render(
      <>
        <SessionChip botName="Claude" harness="claude-code" sessionName="plane@6995b6f5" />
        <SessionChip botName="Claude" sessionName="plane@6995b6f5" variant="claim" showBot={false} size="sm" />
      </>
    );
    const [plain, claim] = [...container.children] as HTMLElement[];
    expect(plain.title).toBe("Claude · plane@6995b6f5");
    expect(plain.textContent).toContain("Claude·plane@6995b6f5");
    expect(plain.className).toContain("bg-layer-1");
    expect(claim.className).toContain("bg-activity-subtle");
    expect(claim.textContent).not.toContain("Claude");
    expect(getAllByText("plane@6995b6f5", { selector: ".font-code" })).toHaveLength(2);
  });
});

describe("ProjectBadge", () => {
  it("draws the first letter on a square in a stable colour when the project has no logo", () => {
    const { container } = render(<ProjectBadge name="homelab" seed="HOME" size={16} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe("H");
    expect(badge.style.width).toBe("16px");
    expect(badge.style.borderRadius).toBe("4px");
    expect(projectBadgeColor("HOME")).toBe(projectBadgeColor("HOME"));
    expect(PROJECT_BADGE_COLORS).toContain(projectBadgeColor("HOME"));
  });

  it("falls back to the badge when the logo names nothing, and shows the logo when it does", () => {
    const empty = render(<ProjectBadge name="Plane" logo={{ in_use: "emoji", emoji: {} }} />);
    expect(empty.container.textContent).toBe("P");
    const withEmoji = render(<ProjectBadge name="Plane" logo={{ in_use: "emoji", emoji: { value: "128512" } }} />);
    expect(withEmoji.container.textContent).not.toBe("P");
  });
});
