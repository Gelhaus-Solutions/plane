/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

/**
 * Formats a shortcut string for display, one label per key
 * e.g. "cmd+shift+," -> ["⌘", "⇧", ","] on Mac, ["Ctrl", "Shift", ","] elsewhere
 */
export const formatShortcutForDisplay = (shortcut: string | undefined, isMac: boolean): string[] => {
  if (!shortcut) return [];

  return shortcut.split("+").map((part) => {
    const lower = part.toLowerCase().trim();

    // Map to proper symbols
    switch (lower) {
      case "cmd":
      case "meta":
        return isMac ? "⌘" : "Ctrl";
      case "ctrl":
        return isMac ? "⌃" : "Ctrl";
      case "alt":
      case "option":
        return isMac ? "⌥" : "Alt";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "delete":
      case "backspace":
        return "⌫";
      case "enter":
      case "return":
        return "↵";
      case "space":
        return "Space";
      case "escape":
      case "esc":
        return "Esc";
      case "tab":
        return "Tab";
      case "arrowup":
      case "up":
        return "↑";
      case "arrowdown":
      case "down":
        return "↓";
      case "arrowleft":
      case "left":
        return "←";
      case "arrowright":
      case "right":
        return "→";
      case ",":
        return ",";
      case ".":
        return ".";
      default:
        return part.toUpperCase();
    }
  });
};

export function ShortcutBadge({ shortcut }: { shortcut: string | undefined }) {
  const { platform } = usePlatformOS();
  const labels = formatShortcutForDisplay(shortcut, platform === "MacOS");
  if (labels.length === 0) return null;

  return (
    <div className="pointer-events-none inline-flex shrink-0 items-center gap-[3px] font-medium select-none">
      {labels.map((label, index) => (
        <kbd
          // oxlint-disable-next-line react/no-array-index-key -- static list from a constant string, never reordered
          key={index}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary"
        >
          {label}
        </kbd>
      ))}
    </div>
  );
}

type TKeySequenceBadgeProps = {
  sequence: string | undefined;
  /** Translated connector rendered between keys, e.g. "then" in "G then M"; the command menu shows the keys side by side */
  separator?: string;
};

export function KeySequenceBadge({ sequence, separator }: TKeySequenceBadgeProps) {
  if (!sequence) return null;

  const chars = sequence.split("");

  return (
    <div className="pointer-events-none inline-flex shrink-0 items-center gap-[3px] font-medium select-none">
      {chars.map((char, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- static list from a constant string, never reordered
        <React.Fragment key={index}>
          <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary">
            {char.toUpperCase()}
          </kbd>
          {separator && index < chars.length - 1 && <span className="text-10 text-placeholder">{separator}</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
