/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

import { BotAvatar } from "../bot-avatar/bot-avatar";
import type { Harness } from "../bot-avatar/harness-glyph";

export type SessionChipProps = {
  /** The harness bot's name, for example Claude. */
  botName: string;
  harness?: Harness;
  /** The bot's colour; defaults to the bot colour. */
  botColor?: string;
  /** The agent bus name of the session, for example plane@6995b6f5. */
  sessionName: string;
  /** claim is the tinted chip of an item a session holds. */
  variant?: "default" | "claim";
  size?: "md" | "sm";
  /** Leave the bot's name out, when the surroundings already name it. */
  showBot?: boolean;
  className?: string;
};

/** A session: the bot's glyph, the bot's name and the session's bus name in mono, as in Claude · plane@6995b6f5. */
export function SessionChip({
  botName,
  harness,
  botColor,
  sessionName,
  variant = "default",
  size = "md",
  showBot = true,
  className,
}: SessionChipProps) {
  const small = size === "sm";
  return (
    <span
      title={`${botName} · ${sessionName}`}
      className={cn(
        "box-border inline-flex max-w-full min-w-0 items-center self-start rounded-[11px] border whitespace-nowrap text-primary",
        small ? "h-[18px] gap-1 pr-1.5 pl-0.5 text-11" : "h-[22px] gap-1.5 pr-2 pl-[3px] text-12",
        variant === "claim"
          ? "border-[color-mix(in_srgb,var(--activity-primary)_45%,var(--border-strong))] bg-activity-subtle"
          : "border-strong bg-layer-1",
        className
      )}
    >
      <BotAvatar name={botName} bot harness={harness} color={botColor} size={small ? 14 : 16} />
      {showBot && (
        <>
          <span className="font-medium">{botName}</span>
          <span className="text-tertiary">·</span>
        </>
      )}
      <span className={cn("truncate font-code text-secondary", small ? "text-[10.5px]" : "text-[11.5px]")}>
        {sessionName}
      </span>
    </span>
  );
}
