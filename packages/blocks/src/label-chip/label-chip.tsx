/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

/** The colours the label picker offers, as the Pulse tokens; a label's own colour is data and overrides them. */
export const LABEL_PALETTE = [
  "blue",
  "teal",
  "pink",
  "violet",
  "amber",
  "green",
  "red",
  "cyan",
  "orange",
  "slate",
] as const;

export type LabelPaletteColor = (typeof LABEL_PALETTE)[number];

/** The CSS colour of a palette entry. */
export function labelPaletteColor(name: LabelPaletteColor): string {
  return `var(--label-${name})`;
}

export type LabelChipProps = {
  name: string;
  /** Any CSS colour: the label's own colour, or labelPaletteColor(...). */
  color: string;
  /** chip is the rounded pill, tag the squarer one. */
  shape?: "chip" | "tag";
  className?: string;
};

/** A label: a dot in its colour and its name. Never a filled pill. */
export function LabelChip({ name, color, shape = "chip", className }: LabelChipProps) {
  return (
    <span
      className={cn(
        "box-border inline-flex h-5 items-center gap-[5px] border border-strong text-[11.5px] whitespace-nowrap text-secondary",
        shape === "chip" ? "rounded-[10px] px-[7px]" : "rounded-md px-1.5",
        className
      )}
    >
      <span className="size-1.5 flex-none rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
