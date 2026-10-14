/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "@plane/utils";

export type PulseStateSvgProps = Omit<React.ComponentPropsWithoutRef<"svg">, "color"> & {
  /** @deprecated State icons take their colour from the state group (Pulse); an explicit colour is ignored. */
  color?: string;
};

/**
 * The shell of every state group icon in the Pulse design: a 14 px grid, 1.5 stroke, drawn in the group's colour.
 * The glyphs inside paint with currentColor, so the colour class on the svg is the only colour there is.
 */
export function PulseStateSvg({
  className,
  children,
  width = "14",
  height = "14",
  color: _color,
  ...rest
}: PulseStateSvgProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={rest["aria-label"] ? undefined : true}
      role={rest["aria-label"] ? "img" : undefined}
      className={cn("shrink-0", className)}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The path of a pie that covers `fraction` (0 to 1) of a circle of radius `r` at (7, 7), clockwise from the top. */
export function piePath(fraction: number, r = 3.4): string {
  const f = Math.max(0, Math.min(1, fraction));
  if (f >= 1) return `M7 ${7 - r}A${r} ${r} 0 1 1 7 ${7 + r}A${r} ${r} 0 1 1 7 ${7 - r}Z`;
  const angle = f * 2 * Math.PI;
  const x = 7 + r * Math.sin(angle);
  const y = 7 - r * Math.cos(angle);
  const large = f > 0.5 ? 1 : 0;
  return `M7 7V${7 - r}A${r} ${r} 0 ${large} 1 ${x.toFixed(3)} ${y.toFixed(3)}Z`;
}
