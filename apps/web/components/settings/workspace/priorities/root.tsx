/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { CodeOutline, LockOutline, MoreHorizontalOutline, AddOutline, DeleteOutline } from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, ISSUE_PRIORITIES } from "@plane/constants";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { PRIORITY_ROW_ICONS, PriorityIcon, PriorityRowIcon } from "@plane/blocks/icons";
import { workspacePriorityLabel } from "@plane/blocks/property-select";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIssuePriorities, TWorkspacePriority } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { Segmented } from "@/components/analytics/charts/cards";
import { SettingsBox, SettingsRow } from "@/components/settings/group";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { usePriority } from "@/hooks/store/use-priority";
import { useUserPermissions } from "@/hooks/store/user";

const K = "workspace_settings.settings.priorities";

const LEVELS = ISSUE_PRIORITIES.map((priority) => priority.key);

// the frame's swatches: red, orange, green, blue, purple and grey
const COLOURS = ["#E5484D", "#F5A524", "#30A46C", "#3E63DD", "#8E4EC6", "#80838D"];

type TDraft = {
  id: string | null;
  name: string;
  level: TIssuePriorities;
  color: string;
  icon: string;
  sequence: number | null;
  is_builtin: boolean;
};

const draftOf = (priority: TWorkspacePriority): TDraft => ({
  id: priority.id,
  name: priority.name,
  level: priority.level,
  color: priority.color,
  icon: priority.icon,
  sequence: priority.sequence,
  is_builtin: priority.is_builtin,
});

const NEW_DRAFT: TDraft = {
  id: null,
  name: "",
  level: "urgent",
  color: COLOURS[0],
  icon: "blocking",
  sequence: null,
  is_builtin: false,
};

/** A level's rows in the order lists sort them: the built-in one, then the custom ones by their order. */
const rowsAt = (priorities: TWorkspacePriority[], level: TIssuePriorities) =>
  priorities
    .filter((priority) => priority.level === level)
    // a fresh array, sorted in place
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.sequence - b.sequence);

/** The sequence that puts a custom priority right after `after` among the level's rows. */
const sequenceAfter = (rows: TWorkspacePriority[], after: TWorkspacePriority) => {
  const customs = rows.filter((row) => !row.is_builtin);
  if (after.is_builtin) return customs.length ? customs[0].sequence - 1000 : 65535;
  const next = customs[customs.findIndex((row) => row.id === after.id) + 1];
  return next ? (after.sequence + next.sequence) / 2 : after.sequence + 1000;
};

type Props = { workspaceSlug: string };

/** Workspace settings, Priorities (E35, r15-01): the five levels with the workspace's own under each. */
export const PrioritiesSettingsRoot = observer(function PrioritiesSettingsRoot({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const { getPriorities, fetchPriorities, createPriority, updatePriority, deletePriority } = usePriority();
  const { allowPermissions } = useUserPermissions();
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<TDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TWorkspacePriority | null>(null);

  const priorities = getPriorities(workspaceSlug);
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  // asked again on every visit, so the counts are current
  useEffect(() => {
    fetchPriorities(workspaceSlug, true)
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  }, [fetchPriorities, workspaceSlug]);

  const labelOf = (priority: Pick<TWorkspacePriority, "name" | "key" | "is_builtin">) =>
    workspacePriorityLabel(t, priority);
  const levelLabel = (level: TIssuePriorities) => t(level) || level;

  const original = draft?.id ? priorities?.find((priority) => priority.id === draft.id) : undefined;
  const dirty =
    !!draft &&
    !!draft.name.trim() &&
    (!original ||
      original.name !== draft.name.trim() ||
      original.level !== draft.level ||
      original.color !== draft.color ||
      original.icon !== draft.icon ||
      original.sequence !== draft.sequence);

  const save = async () => {
    if (!draft || !dirty || saving || !isAdmin) return;
    setSaving(true);
    const name = draft.name.trim();
    const fields = draft.is_builtin
      ? { name }
      : {
          name,
          level: draft.level,
          color: draft.color,
          icon: draft.icon,
          ...(draft.sequence !== null ? { sequence: draft.sequence } : {}),
        };
    try {
      const saved = draft.id
        ? await updatePriority(workspaceSlug, draft.id, fields)
        : await createPriority(workspaceSlug, fields);
      setDraft(draftOf(saved));
      setToast({ type: "success", title: t(draft.id ? `${K}.saved` : `${K}.created`) });
    } catch (error) {
      const taken = !!(error as { error?: string } | undefined)?.error?.includes("already exists");
      setToast({ type: "error", title: t(taken ? `${K}.taken` : `${K}.failed`) });
    } finally {
      setSaving(false);
    }
  };

  // ⌘S saves, as the frame's Save button shows
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const remove = async (priority: TWorkspacePriority) => {
    try {
      await deletePriority(workspaceSlug, priority.id);
      if (draft?.id === priority.id) setDraft(null);
      setToast({ type: "success", title: t(`${K}.deleted`) });
    } catch {
      setToast({ type: "error", title: t(`${K}.failed`) });
    } finally {
      setDeleting(null);
    }
  };

  const total = (priorities ?? []).reduce((sum, priority) => sum + (priority.issue_count ?? 0), 0);
  const example = priorities?.find((priority) => !priority.is_builtin);
  const builtinOf = (level: TIssuePriorities) =>
    priorities?.find((priority) => priority.is_builtin && priority.level === level);
  const deletingBuiltin = deleting ? builtinOf(deleting.level) : undefined;

  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsHeading
        title={t(`${K}.title`)}
        description={t(`${K}.description`)}
        control={
          isAdmin && (
            <Button
              variant="primary"
              size="sm"
              stretch="auto"
              label={t(`${K}.save`)}
              disabled={!dirty}
              loading={saving}
              onClick={() => void save()}
            />
          )
        }
      />

      {failed && !priorities ? (
        <p className="text-13 text-secondary">{t(`${K}.load_failed`)}</p>
      ) : !priorities ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-layer-2" />
          ))}
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-13 font-semibold text-primary">
              {t(`${K}.list_title`)}
              <span className="font-normal text-12 text-secondary">{t(`${K}.used`, { count: total })}</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...NEW_DRAFT })}
                  className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-13 font-medium text-primary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
                >
                  <AddOutline className="size-3.5" />
                  {t(`${K}.new`)}
                </button>
              )}
            </div>
            <SettingsBox>
              {LEVELS.map((level) => (
                <div key={level} className="border-b border-subtle last:border-b-0">
                  <div className="flex h-9 items-center gap-2 px-3.5 text-12">
                    <PriorityIcon priority={level} className="size-3" />
                    <span className="text-[11px] font-semibold tracking-[0.06em] text-primary uppercase">
                      {t(`${K}.level_heading`, { level: levelLabel(level) })}
                    </span>
                    <span className="text-secondary">
                      · {t(`${K}.level_note`, { level: levelLabel(level).toLowerCase() })}
                    </span>
                  </div>
                  {rowsAt(priorities, level).map((priority) => (
                    <div
                      key={priority.id}
                      className={cn(
                        "grid min-h-11 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-1.5 text-13 md:grid-cols-[18px_minmax(0,1fr)_190px_72px_56px_24px]",
                        draft?.id === priority.id && "bg-layer-1-selected"
                      )}
                    >
                      <PriorityRowIcon priority={priority} className="size-4" />
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-primary">{labelOf(priority)}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-11 text-secondary">
                          {priority.is_builtin && <LockOutline className="size-3" aria-hidden="true" />}
                          {t(priority.is_builtin ? `${K}.builtin` : `${K}.custom`)}
                        </span>
                      </span>
                      <code className="hidden truncate font-code text-12 text-secondary md:block">
                        priority = &quot;{priority.is_builtin ? priority.level : priority.name}&quot;
                      </code>
                      <span className="hidden text-12 text-secondary tabular-nums md:block">
                        {t(`${K}.items`, { count: priority.issue_count ?? 0 })}
                      </span>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setDraft(draftOf(priority))}
                          className="justify-self-start rounded px-1 text-12 text-secondary outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong"
                        >
                          {t(priority.is_builtin ? `${K}.rename` : `${K}.edit`)}
                        </button>
                      ) : (
                        <span />
                      )}
                      {isAdmin && !priority.is_builtin ? (
                        <Menu>
                          <MenuTrigger
                            render={
                              <button
                                type="button"
                                aria-label={t(`${K}.menu`)}
                                className="grid size-6 place-items-center rounded-md text-secondary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
                              >
                                <MoreHorizontalOutline className="size-3.5" />
                              </button>
                            }
                          />
                          <MenuContent side="bottom" align="end">
                            <MenuItem
                              icon={<DeleteOutline />}
                              label={t(`${K}.delete`)}
                              onClick={() => setDeleting(priority)}
                            />
                          </MenuContent>
                        </Menu>
                      ) : (
                        <span className="hidden md:block" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </SettingsBox>
            <p className="flex items-start gap-2 px-1 text-12 leading-relaxed text-secondary">
              <CodeOutline className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                <code className="font-code text-primary">priority = &quot;urgent&quot;</code> {t(`${K}.pql_level`)}{" "}
                <code className="font-code text-primary">priority = &quot;{example?.name ?? "Blocker"}&quot;</code>{" "}
                {t(`${K}.pql_name`)}
              </span>
            </p>
            {!isAdmin && <p className="px-1 text-12 text-tertiary">{t(`${K}.admins_only`)}</p>}
          </section>

          {draft && isAdmin && (
            <PriorityEditor
              key={draft.id ?? "new"}
              draft={draft}
              priorities={priorities}
              labelOf={labelOf}
              levelLabel={levelLabel}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={() => void save()}
              canSave={dirty}
              saving={saving}
            />
          )}
        </>
      )}

      {deleting && (
        <ConfirmDialog
          isOpen
          isSubmitting={false}
          title={t(`${K}.delete_confirm.title`, { name: deleting.name })}
          content={t(`${K}.delete_confirm.content`, {
            count: deleting.issue_count ?? 0,
            level: levelLabel(deleting.level),
            builtin: deletingBuiltin ? labelOf(deletingBuiltin) : levelLabel(deleting.level),
          })}
          handleClose={() => setDeleting(null)}
          handleSubmit={() => remove(deleting)}
        />
      )}
    </div>
  );
});

type EditorProps = {
  draft: TDraft;
  priorities: TWorkspacePriority[];
  labelOf: (priority: Pick<TWorkspacePriority, "name" | "key" | "is_builtin">) => string;
  levelLabel: (level: TIssuePriorities) => string;
  onChange: (draft: TDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
};

type TOrderOption = { id: string; label: string };

/** The picked priority in full (r15-01): its name, and for a custom one its level, colour, icon and order. */
function PriorityEditor(props: EditorProps) {
  const { draft, priorities, labelOf, levelLabel, onChange, onCancel, onSave, canSave, saving } = props;
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const set = (fields: Partial<TDraft>) => onChange({ ...draft, ...fields });

  // opened by New priority, rename or edit: the editor comes into view with its name field ready
  useEffect(() => {
    nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  const key = draft.is_builtin ? (priorities.find((priority) => priority.id === draft.id)?.key ?? null) : null;
  const title = draft.id ? labelOf({ name: draft.name, key, is_builtin: draft.is_builtin }) : t(`${K}.new`);
  const subtitle = !draft.id
    ? t(`${K}.editor_new`)
    : t(draft.is_builtin ? `${K}.editor_builtin` : `${K}.editor_custom`, { level: levelLabel(draft.level) });

  // the order among the level's rows: right after one of the others, the built-in one first
  const rows = rowsAt(priorities, draft.level).filter((priority) => priority.id !== draft.id);
  const placed = draft.sequence ?? Number.POSITIVE_INFINITY;
  let after = rows[0];
  for (const row of rows) if (row.is_builtin || row.sequence < placed) after = row;
  const orderOptions: TOrderOption[] = rows.map((row) => ({
    id: row.id,
    label: t(`${K}.order_after`, { name: labelOf(row) }),
  }));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 text-13 font-semibold text-primary">
        <span className="truncate">{title || t(`${K}.new`)}</span>
        <span className="font-normal text-12 text-secondary">{subtitle}</span>
      </div>
      <SettingsBox>
        <SettingsRow
          title={t(`${K}.name`)}
          description={t(`${K}.name_hint`)}
          control={
            <input
              ref={nameRef}
              value={draft.name}
              maxLength={255}
              onChange={(event) => set({ name: event.target.value })}
              placeholder={t(`${K}.name_placeholder`)}
              aria-label={t(`${K}.name`)}
              className="h-[30px] w-[220px] rounded-md border border-strong bg-layer-1 px-2.5 text-13 text-primary shadow-e1 outline-none placeholder:text-placeholder focus:border-accent-strong"
            />
          }
        />
        {!draft.is_builtin && (
          <>
            <SettingsRow
              title={t(`${K}.level`)}
              description={t(`${K}.level_hint`)}
              control={
                <Segmented
                  label={t(`${K}.level`)}
                  value={draft.level}
                  // a new level puts it last in that level
                  onChange={(level) => set({ level, sequence: null })}
                  options={LEVELS.map((level) => ({ value: level, label: levelLabel(level) }))}
                />
              }
            />
            <SettingsRow
              title={t(`${K}.colour`)}
              control={
                <div role="radiogroup" aria-label={t(`${K}.colour`)} className="flex items-center gap-2">
                  {COLOURS.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      role="radio"
                      aria-checked={draft.color === colour}
                      aria-label={colour}
                      onClick={() => set({ color: colour })}
                      className={cn(
                        "size-5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
                        draft.color === colour && "ring-offset-surface-2 ring-2 ring-(--border-strong) ring-offset-2"
                      )}
                      style={{ background: colour }}
                    />
                  ))}
                </div>
              }
            />
            <SettingsRow
              title={t(`${K}.icon`)}
              control={
                <div role="radiogroup" aria-label={t(`${K}.icon`)} className="flex items-center gap-1">
                  {["", ...Object.keys(PRIORITY_ROW_ICONS)].map((icon) => (
                    <button
                      key={icon || "bars"}
                      type="button"
                      role="radio"
                      aria-checked={draft.icon === icon}
                      aria-label={icon || t(`${K}.icon_bars`)}
                      title={icon ? undefined : t(`${K}.icon_bars`)}
                      onClick={() => set({ icon })}
                      className={cn(
                        "grid size-7 place-items-center rounded-md outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong",
                        draft.icon === icon && "bg-layer-1-selected ring-1 ring-(--border-strong)"
                      )}
                    >
                      <PriorityRowIcon
                        priority={{ level: draft.level, icon, color: draft.color, is_builtin: false }}
                        className="size-4"
                      />
                    </button>
                  ))}
                </div>
              }
            />
            {rows.length > 0 && after && (
              <SettingsRow
                title={t(`${K}.order`)}
                description={t(`${K}.order_hint`, {
                  level: levelLabel(draft.level),
                  name: draft.name.trim() || t(`${K}.new`),
                  after: labelOf(after),
                })}
                control={
                  <Select<TOrderOption>
                    getValues={() => orderOptions}
                    value={orderOptions.find((option) => option.id === after.id) ?? null}
                    onChange={(id) => {
                      const row = rows.find((priority) => priority.id === id);
                      if (row) set({ sequence: sequenceAfter(rows, row) });
                    }}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => option.label}
                    showSearch={false}
                    pinSelected={false}
                  >
                    <Select.Trigger
                      variant="select-md"
                      aria-label={t(`${K}.order`)}
                      className="h-[30px] min-w-[170px] border border-strong bg-layer-1 shadow-e1"
                    >
                      <span className="truncate text-left text-primary">
                        {t(`${K}.order_after`, { name: labelOf(after) })}
                      </span>
                    </Select.Trigger>
                  </Select>
                }
              />
            )}
          </>
        )}
      </SettingsBox>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" stretch="auto" label={t(`${K}.cancel`)} onClick={onCancel} />
        <Button
          variant="primary"
          size="sm"
          stretch="auto"
          label={t(`${K}.save`)}
          disabled={!canSave}
          loading={saving}
          onClick={onSave}
        />
      </div>
    </section>
  );
}
