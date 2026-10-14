/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

/** The harnesses a bot can belong to; the API's own names. */
export type Harness = "claude-code" | "codex" | "garness" | "other";

// One glyph per harness, never a vendor logo: a terminal for Claude Code, braces for Codex, a bot otherwise
const GLYPHS: Record<Harness, React.ReactNode> = {
  "claude-code": (
    <>
      <rect x="2" y="3" width="12" height="10" rx="2.2" />
      <path d="m5 6.8 2 1.7-2 1.7M8.6 10.6h2.6" />
    </>
  ),
  codex: (
    <path d="M6 2.8c-1.4 0-2 .7-2 2v1.3c0 .8-.5 1.4-1.4 1.4v1c.9 0 1.4.6 1.4 1.4v1.3c0 1.3.6 2 2 2M10 2.8c1.4 0 2 .7 2 2v1.3c0 .8.5 1.4 1.4 1.4v1c-.9 0-1.4.6-1.4 1.4v1.3c0 1.3-.6 2-2 2" />
  ),
  garness: (
    <>
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <path d="M8 2.5V5M6.2 9h.01M9.8 9h.01" />
    </>
  ),
  other: (
    <>
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <path d="M8 2.5V5M6.2 9h.01M9.8 9h.01" />
    </>
  ),
};

export type HarnessGlyphProps = {
  harness: Harness;
  size?: number;
  className?: string;
};

export function HarnessGlyph({ harness, size = 16, className }: HarnessGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {GLYPHS[harness] ?? GLYPHS.other}
    </svg>
  );
}
