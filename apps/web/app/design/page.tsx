/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// The Pulse design system as a page (E09): the colour, type, shape, icon and component sheets of the redesign
// bundle, rendered from the real tokens and components in either theme. Served in development builds only.

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
// plane imports
import { BotAvatar, HarnessGlyph } from "@plane/blocks/bot-avatar";
import type { Harness } from "@plane/blocks/bot-avatar";
import { PriorityIcon, StateGroupIcon } from "@plane/blocks/icons";
import { LABEL_PALETTE, LabelChip, labelPaletteColor } from "@plane/blocks/label-chip";
import { SessionChip } from "@plane/blocks/session-chip";
import { StateLozenge } from "@plane/blocks/state-lozenge";
import { Button } from "@makeplane/propel/components/button";
import { InputField } from "@makeplane/propel/components/input-field";
import { Switch } from "@makeplane/propel/components/switch";

type Swatch = { token: string; use: string };

const COLOUR_GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: "Surfaces",
    swatches: [
      { token: "bg-canvas", use: "App frame behind the sidebar and the content panel" },
      { token: "bg-surface-1", use: "Content panel, dialogs" },
      { token: "bg-surface-2", use: "Group headers, detail rail, board columns" },
      { token: "bg-layer-1", use: "Cards, inputs, raised buttons" },
      { token: "bg-layer-1-hover", use: "Row and item hover" },
      { token: "bg-layer-2", use: "Chips, segmented tracks, inline code" },
      { token: "bg-layer-3", use: "Key hints" },
      { token: "bg-layer-1-selected", use: "Current nav item, selected option" },
      { token: "bg-popover", use: "Menus, popovers, toasts" },
      { token: "bg-backdrop", use: "Dialog and command menu scrim" },
    ],
  },
  {
    title: "Text",
    swatches: [
      { token: "txt-primary", use: "Titles, body, values" },
      { token: "txt-secondary", use: "Labels, metadata, IDs" },
      { token: "txt-tertiary", use: "Timestamps, counts, helper text" },
      { token: "txt-placeholder", use: "Placeholders only" },
      { token: "txt-disabled", use: "Disabled controls" },
      { token: "txt-on-color", use: "Text on accent fills" },
    ],
  },
  {
    title: "Borders",
    swatches: [
      { token: "border-subtle", use: "Row dividers" },
      { token: "border-strong", use: "Panel, card, input and chip outlines" },
      { token: "border-strong-1", use: "Checkbox and radio outlines" },
      { token: "border-accent-strong", use: "Focused input, drop slot" },
    ],
  },
  {
    title: "Accent",
    swatches: [
      { token: "bg-accent-primary", use: "Primary buttons, links, current tab" },
      { token: "bg-accent-primary-hover", use: "Hover on accent" },
      { token: "bg-accent-subtle", use: "Focus halo, arrival flash" },
      { token: "bg-accent-row", use: "Selected rows, drop column" },
    ],
  },
  {
    title: "Agents",
    swatches: [
      { token: "activity-primary", use: "A bot at work: ring, progress, typing" },
      { token: "activity-subtle", use: "Agent progress strip" },
      { token: "bot-build", use: "Default bot colour" },
      { token: "bot-review", use: "Default second bot colour" },
    ],
  },
  {
    title: "Feedback",
    swatches: [
      { token: "txt-danger-primary", use: "Errors, destructive actions" },
      { token: "bg-danger-subtle", use: "Error banners" },
      { token: "txt-success-primary", use: "Valid query, saved" },
      { token: "bg-success-subtle", use: "Success banners" },
      { token: "txt-warning-primary", use: "Offline, due soon" },
      { token: "bg-warning-subtle", use: "Offline banner" },
    ],
  },
  {
    title: "State groups and priority",
    swatches: [
      { token: "txt-icon-states-backlog", use: "Dashed ring" },
      { token: "txt-icon-states-unstarted", use: "Empty ring" },
      { token: "txt-icon-states-started", use: "Half pie" },
      { token: "state-started-2", use: "Second started state (Review)" },
      { token: "txt-icon-states-completed", use: "Filled disc with check" },
      { token: "txt-icon-states-cancelled", use: "Disc with cross" },
      { token: "priority-urgent", use: "Urgent square" },
      { token: "priority-high", use: "Priority bars" },
    ],
  },
  {
    title: "Labels",
    swatches: LABEL_PALETTE.map((name) => ({ token: `label-${name}`, use: "Label colour picker" })),
  },
  {
    title: "PQL syntax and charts",
    swatches: [
      { token: "syntax-field", use: "Fields" },
      { token: "syntax-operator", use: "Operators and keywords" },
      { token: "syntax-value", use: "Values and strings" },
      { token: "syntax-function", use: "Functions" },
      { token: "syntax-error", use: "Error caret and message" },
      { token: "chart-1", use: "Series 1" },
      { token: "chart-2", use: "Series 2" },
      { token: "chart-3", use: "Series 3" },
    ],
  },
];

const TYPE_SCALE: { name: string; className: string; sample: string; use: string }[] = [
  {
    name: "display 26",
    className: "text-26 leading-[1.2] font-semibold tracking-[-0.022em]",
    sample: "Rebuild the shell on Pulse",
    use: "Work item title on its page",
  },
  {
    name: "title 22",
    className: "text-22 leading-[1.2] font-semibold tracking-[-0.02em]",
    sample: "Work items",
    use: "View and page titles",
  },
  {
    name: "heading 15",
    className: "text-15 leading-[1.3] font-semibold tracking-[-0.01em]",
    sample: "Activity",
    use: "Section headings",
  },
  {
    name: "body-lg 14",
    className: "text-14 leading-[1.62]",
    sample: "Descriptions, comments and pages read at this size.",
    use: "Descriptions, comments",
  },
  { name: "body 13", className: "text-13 leading-[1.4]", sample: "Rows, navigation and controls", use: "Base size" },
  {
    name: "small 12",
    className: "text-12 leading-[1.4]",
    sample: "Metadata and chips",
    use: "Metadata, chips",
  },
  {
    name: "micro 11",
    className: "text-11 leading-[1.35] font-semibold tracking-[0.02em]",
    sample: "IN PROGRESS",
    use: "Lozenges",
  },
  {
    name: "caps 10.5",
    className: "text-10-5 leading-[1.3] font-semibold tracking-[0.08em] uppercase",
    sample: "Section label",
    use: "Section labels, box headers",
  },
  {
    name: "mono 12",
    className: "font-code text-12 leading-[1.4]",
    sample: "PLANE-133 plane@6995b6f5",
    use: "IDs, PQL",
  },
];

const HARNESSES: Harness[] = ["claude-code", "codex", "garness"];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="flex items-baseline gap-2.5 text-15 font-semibold tracking-[-0.01em]">
        {title}
        {note && <span className="font-normal font-code text-[11.5px] text-tertiary">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

function Cell({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-strong bg-surface-1 p-4 shadow-e1">
      <span className="text-10-5 font-semibold tracking-[0.08em] text-tertiary uppercase">{caption}</span>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="inline-flex gap-1 rounded-lg bg-layer-2 p-0.5" role="group" aria-label="Theme">
      {["light", "dark", "system"].map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => setTheme(name)}
          className={
            mounted && theme === name
              ? "h-6 rounded-md bg-layer-1 px-2.5 text-12 font-medium text-primary shadow-e1"
              : "h-6 rounded-md px-2.5 text-12 font-medium text-secondary hover:text-primary"
          }
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export default function DesignSheetPage() {
  return (
    <div className="h-screen overflow-auto bg-canvas text-13 text-primary">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-9 px-10 pt-10 pb-16">
        <header className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-26 leading-[1.2] font-semibold tracking-[-0.022em]">Pulse design system</h1>
            <ThemeSwitch />
          </div>
          <p className="max-w-[72ch] text-[13.5px] leading-[1.55] text-secondary">
            Colour, type, shape and components of the redesign, drawn from the real tokens and components. Dark first,
            one violet accent, Geist and Geist Mono.
          </p>
        </header>

        <Section title="Colour" note="packages/tailwind-config/pulse.css">
          {COLOUR_GROUPS.map((group) => (
            <Cell key={group.title} caption={group.title}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                {group.swatches.map((swatch) => (
                  <div key={swatch.token} className="flex items-center gap-2.5">
                    <span
                      className="size-8 flex-none rounded-lg border border-strong"
                      style={{ background: `var(--${swatch.token})` }}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-code text-12 text-primary">{swatch.token}</span>
                      <span className="truncate text-[11.5px] text-tertiary">{swatch.use}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Cell>
          ))}
        </Section>

        <Section title="Type" note="Geist, tabular numbers">
          <Cell caption="Scale">
            <div className="flex flex-col gap-3">
              {TYPE_SCALE.map((row) => (
                <div key={row.name} className="grid grid-cols-[110px_1fr_auto] items-baseline gap-4">
                  <span className="font-code text-[11.5px] text-tertiary">{row.name}</span>
                  <span className={row.className}>{row.sample}</span>
                  <span className="text-[11.5px] text-tertiary">{row.use}</span>
                </div>
              ))}
            </div>
          </Cell>
        </Section>

        <Section title="Shape" note="radii and elevation">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
            <Cell caption="Radii">
              <Row>
                {[
                  ["kbd 4", "rounded-[4px]"],
                  ["chip 6", "rounded-[6px]"],
                  ["control 7", "rounded-[7px]"],
                  ["button 8", "rounded-[8px]"],
                  ["card 10", "rounded-[10px]"],
                  ["panel 12", "rounded-xl"],
                  ["pill", "rounded-full"],
                ].map(([name, cls]) => (
                  <span
                    key={name}
                    className={`grid h-12 w-16 place-items-center border border-strong-1 bg-layer-2 text-[10.5px] text-secondary ${cls}`}
                  >
                    {name}
                  </span>
                ))}
              </Row>
            </Cell>
            <Cell caption="Elevation">
              <Row>
                {[
                  ["e1", "shadow-e1 border border-strong"],
                  ["e2", "shadow-e2 border border-strong"],
                  ["e3", "shadow-e3 bg-popover"],
                ].map(([name, cls]) => (
                  <span
                    key={name}
                    className={`grid h-14 w-20 place-items-center rounded-xl bg-layer-1 text-12 text-secondary ${cls}`}
                  >
                    {name}
                  </span>
                ))}
              </Row>
            </Cell>
          </div>
        </Section>

        <Section title="Icons" note="@plane/blocks/icons">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
            <Cell caption="State groups">
              <Row>
                <StateGroupIcon stateGroup="backlog" size="lg" />
                <StateGroupIcon stateGroup="unstarted" size="lg" />
                <StateGroupIcon stateGroup="started" size="lg" />
                <StateGroupIcon stateGroup="started" review size="lg" />
                <StateGroupIcon stateGroup="completed" size="lg" />
                <StateGroupIcon stateGroup="cancelled" size="lg" />
              </Row>
            </Cell>
            <Cell caption="Priority">
              <Row>
                {(["none", "low", "medium", "high", "urgent"] as const).map((priority) => (
                  <PriorityIcon key={priority} priority={priority} className="size-4" />
                ))}
              </Row>
            </Cell>
            <Cell caption="Harness glyphs">
              <Row>
                {HARNESSES.map((harness) => (
                  <span key={harness} className="text-secondary">
                    <HarnessGlyph harness={harness} size={20} />
                  </span>
                ))}
              </Row>
            </Cell>
          </div>
        </Section>

        <Section title="Composites" note="@plane/blocks">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
            <Cell caption="State lozenges">
              <Row>
                <StateLozenge kind="backlog">Backlog</StateLozenge>
                <StateLozenge kind="unstarted">Todo</StateLozenge>
                <StateLozenge kind="started">In Progress</StateLozenge>
                <StateLozenge kind="review">In Review</StateLozenge>
                <StateLozenge kind="completed">Done</StateLozenge>
                <StateLozenge kind="cancelled">Cancelled</StateLozenge>
              </Row>
            </Cell>
            <Cell caption="Labels">
              <Row>
                {LABEL_PALETTE.map((name) => (
                  <LabelChip key={name} name={name} color={labelPaletteColor(name)} />
                ))}
              </Row>
            </Cell>
            <Cell caption="Avatars">
              <Row>
                <BotAvatar name="Enno Gelhaus" size={32} />
                <BotAvatar name="Sophie Brandt" size={24} color="#a65a24" />
                <BotAvatar name="Tom Becker" size={20} color="#5d4fc4" />
                <BotAvatar name="Claude" bot harness="claude-code" size={32} />
                <BotAvatar name="Codex" bot harness="codex" color="var(--bot-review)" size={24} />
                <BotAvatar name="Claude" bot harness="claude-code" size={32} working />
              </Row>
            </Cell>
            <Cell caption="Sessions">
              <div className="flex flex-col items-start gap-2">
                <SessionChip botName="Claude" harness="claude-code" sessionName="plane@6995b6f5" />
                <SessionChip botName="Claude" harness="claude-code" sessionName="plane@6995b6f5" variant="claim" />
                <SessionChip
                  botName="Codex"
                  harness="codex"
                  botColor="var(--bot-review)"
                  sessionName="ops@1b3f90aa"
                  size="sm"
                />
              </div>
            </Cell>
          </div>
        </Section>

        <Section title="Controls" note="@makeplane/propel on the tokens">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
            <Cell caption="Buttons">
              <Row>
                <Button variant="primary" size="md" stretch="auto" label="Create" />
                <Button variant="secondary" size="md" stretch="auto" label="Filters" />
                <Button variant="tertiary" size="md" stretch="auto" label="Display" />
                <Button variant="ghost" size="md" stretch="auto" label="Cancel" />
                <Button variant="danger" size="md" stretch="auto" label="Delete" />
                <Button variant="danger-outline" size="md" stretch="auto" label="Remove" />
              </Row>
              <Row>
                <Button variant="primary" size="sm" stretch="auto" label="Small" />
                <Button variant="secondary" size="lg" stretch="auto" label="Large" />
                <Button variant="primary" size="md" stretch="auto" label="Disabled" disabled />
              </Row>
            </Cell>
            <Cell caption="Field and switch">
              <Row>
                <div className="w-60">
                  <InputField
                    size="lg"
                    orientation="vertical"
                    label="Bot name"
                    hint="Shown in activity and pickers"
                    placeholder="Claude"
                  />
                </div>
                <Switch size="md" defaultChecked aria-label="Use group" />
                <Switch size="md" aria-label="Use group off" />
              </Row>
            </Cell>
          </div>
        </Section>
      </div>
    </div>
  );
}
