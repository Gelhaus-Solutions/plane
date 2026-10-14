/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import type { Harness } from "./harness-glyph";
import { HarnessGlyph } from "./harness-glyph";

/** The sizes the design uses are 16, 20, 24 and 32; the session chip also draws a 14. */
export type AvatarSize = number;

export type BotAvatarProps = {
  /** The person's or the bot's name; it makes the initials and the tooltip. */
  name: string;
  /** A bot is a rounded square with its harness's glyph; a person is a circle with initials. */
  bot?: boolean;
  harness?: Harness;
  /** The fill, any CSS colour; a bot's default is the bot colour. */
  color?: string;
  size?: AvatarSize;
  /** A turning ring around a bot that is working. */
  working?: boolean;
  /** A 2 px ring in the surface colour, so overlapping avatars read apart. */
  outline?: boolean;
  className?: string;
};

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

// Corner radius of the bot's rounded square by size
function radiusOf(size: number): number {
  if (size <= 16) return 4;
  if (size <= 20) return 6;
  if (size <= 24) return 7;
  return 9;
}

/** A person (round, initials) or a bot (rounded square, harness glyph; a ring turns while it works). */
export function BotAvatar({
  name,
  bot = false,
  harness = "other",
  color,
  size = 20,
  working = false,
  outline = false,
  className,
}: BotAvatarProps) {
  const fill = color ?? (bot ? "var(--bot-build)" : "#3b62c4");
  const box = { width: size, height: size, background: fill };
  const outlined = outline ? "shadow-[0_0_0_2px_var(--bg-surface-1)]" : "";

  if (!bot) {
    return (
      <span
        title={name}
        className={cn(
          "inline-grid flex-none place-items-center rounded-full leading-none font-semibold text-white",
          outlined,
          className
        )}
        style={{ ...box, fontSize: Math.max(8, Math.round(size * 0.42)) }}
      >
        {initialsOf(name)}
      </span>
    );
  }

  const square = (
    <span
      title={working ? `${name}, bot, working` : `${name}, bot`}
      className={cn("inline-grid flex-none place-items-center text-white", outlined, !working && className)}
      style={{ ...box, borderRadius: radiusOf(size) }}
    >
      <HarnessGlyph harness={harness} size={Math.round(size * 0.62)} />
    </span>
  );
  if (!working) return square;

  return (
    <span
      className={cn(
        "relative inline-grid flex-none place-items-center before:absolute before:-inset-[3px] before:animate-pulse-ring before:rounded-[9px] before:bg-[conic-gradient(var(--activity-primary),transparent_60%,var(--activity-primary))] before:content-[''] motion-reduce:before:animate-none [&>*]:relative",
        className
      )}
    >
      {square}
    </span>
  );
}
