/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  label: string;
  count?: number;
  /** Actions at the end of the head: progress, add buttons */
  right?: ReactNode;
  /** The section's rows, drawn in a bordered box; without children only the head shows */
  children?: ReactNode;
};

/** A section of the work item document (4A, 5A): a 30 px head with icon, label and count, then a boxed list. */
export function DetailSection(props: Props) {
  const { icon, label, count, right, children } = props;

  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <div className="flex h-[30px] items-center gap-2">
        <span className="flex shrink-0 text-secondary [&_svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-[13.5px] font-semibold text-primary">{label}</h2>
        {!!count && <span className="text-[13.5px] text-secondary tabular-nums">{count}</span>}
        <span className="flex-1" />
        {right}
      </div>
      {children && <div className="overflow-hidden rounded-[10px] border border-strong">{children}</div>}
    </section>
  );
}

/** The 24 px icon button of a section head; a span, because some widget actions wrap it in their own button. */
export function SectionIconButton(props: { icon: ReactNode; label: string }) {
  return (
    <span
      title={props.label}
      className="grid size-6 place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary [&_svg]:size-3.5"
    >
      {props.icon}
    </span>
  );
}
