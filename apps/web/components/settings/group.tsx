/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { cn } from "@plane/utils";

/** A box of settings rows (round 8, `settings.py` `.sgb`): surface-2, a strong border, rows split by a subtle rule. */
export function SettingsBox({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[10px] border border-strong bg-surface-2", className)}>{children}</div>
  );
}

type GroupProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
};

/** A titled group of settings: the heading, then its rows in one box. */
export function SettingsGroup({ title, description, right, children }: GroupProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-13 font-semibold text-primary">
        {title}
        {description && <span className="font-normal text-12 text-secondary">{description}</span>}
        {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
      </div>
      <SettingsBox>{children}</SettingsBox>
    </section>
  );
}

type RowProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  className?: string;
};

/** One setting: its name and a line on what it does on the left, the control on the right. */
export function SettingsRow({ title, description, control, className }: RowProps) {
  return (
    <div
      className={cn(
        "grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b border-subtle px-3.5 py-2.5 last:border-b-0",
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-13 font-medium text-primary">{title}</div>
        {description && <div className="mt-0.5 text-12 leading-[1.45] text-secondary">{description}</div>}
      </div>
      {control && <div className="flex flex-wrap items-center justify-end gap-2">{control}</div>}
    </div>
  );
}
