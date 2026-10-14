/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import { Logo } from "../emoji-icon-picker";
import type { Logo as LogoType } from "../types/logo";

/** The fills the design gives its project badges (Plane, Ops, Homelab, Handbook and the next three). */
export const PROJECT_BADGE_COLORS = [
  "#2e7d6b",
  "#a65a24",
  "#5d4fc4",
  "#3b62c4",
  "#7a55cc",
  "#b0457a",
  "#1f7a96",
  "#8a6a14",
] as const;

/** A project's fill: the same seed (its id or identifier) always gets the same colour. */
export function projectBadgeColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PROJECT_BADGE_COLORS[hash % PROJECT_BADGE_COLORS.length];
}

export type ProjectBadgeProps = {
  name: string;
  /** What the colour is derived from; the project id or identifier, so it stays put when the name changes. */
  seed?: string;
  /** The project's own logo wins when it has one. */
  logo?: LogoType | null;
  size?: number;
  /** The size of the logo inside the box, when it should be smaller than the box (the project cards). */
  logoSize?: number;
  className?: string;
  /** Classes for the box around a logo only (a tint behind an emoji or icon). */
  logoClassName?: string;
};

// Corner radius by size, as the design draws it
function radiusOf(size: number): number {
  if (size <= 16) return 4;
  if (size <= 22) return 6;
  return 8;
}

/** A project's mark: its logo, or a coloured square with the first letter of its name. */
export function ProjectBadge({ name, seed, logo, size = 16, logoSize, className, logoClassName }: ProjectBadgeProps) {
  const hasLogo = !!logo?.in_use && !!(logo.in_use === "emoji" ? logo.emoji?.value : logo.icon?.name);
  if (hasLogo) {
    return (
      <span
        className={cn("inline-grid flex-none place-items-center", className, logoClassName)}
        style={{ width: size, height: size }}
      >
        <Logo logo={logo ?? undefined} size={logoSize ?? size} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid flex-none place-items-center leading-none font-bold text-white", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radiusOf(size),
        background: projectBadgeColor(seed ?? name),
        fontSize: Math.round(size * 0.6),
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
