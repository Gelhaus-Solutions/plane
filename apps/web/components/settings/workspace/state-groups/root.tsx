/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import {
  AddOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  DeleteOutline,
  EditOutline,
  GripOutline,
  LockOutline,
  MoreHorizontalOutline,
  StackLayersOutline,
} from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { WorkspaceStateGroupIcon } from "@plane/blocks/icons";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TStateGroups, TWorkspaceStateGroup } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { Segmented } from "@/components/analytics/charts/cards";
import { SettingsBox, SettingsRow } from "@/components/settings/group";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useStateGroup } from "@/hooks/store/use-state-group";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { StateGroupDeleteDialog } from "./delete-dialog";

const K = "workspace_settings.settings.state_groups";

export const STATE_GROUP_CATEGORIES: TStateGroups[] = ["backlog", "unstarted", "started", "completed", "cancelled"];

// the priorities page's swatches: red, orange, green, blue, purple and grey
const COLOURS = ["#E5484D", "#F5A524", "#30A46C", "#3E63DD", "#8E4EC6", "#80838D"];

const ROW =
  "grid grid-cols-[16px_minmax(0,1fr)_26px] items-center gap-x-3 px-3.5 md:grid-cols-[16px_minmax(0,1fr)_140px_150px_26px]";

type TDraft = {
  id: string | null;
  name: string;
  category: TStateGroups;
  color: string;
  is_builtin: boolean;
};

const draftOf = (group: TWorkspaceStateGroup): TDraft => ({
  id: group.id,
  name: group.name,
  category: group.category,
  color: group.color,
  is_builtin: group.is_builtin,
});

const NEW_DRAFT: TDraft = { id: null, name: "", category: "started", color: COLOURS[1], is_builtin: false };

/** The sequence that puts a group at `index` among `others`. */
const sequenceAt = (others: TWorkspaceStateGroup[], index: number) => {
  const before = others[index - 1];
  const after = others[index];
  if (before && after) return (before.sequence + after.sequence) / 2;
  if (before) return before.sequence + 1000;
  if (after) return after.sequence - 1000;
  return 65535;
};

/** Where a group of `category` goes when it is added or moves category: after the last group of that category. */
const sequenceInCategory = (groups: TWorkspaceStateGroup[], category: TStateGroups, id: string | null) => {
  const others = groups.filter((group) => group.id !== id);
  let last = -1;
  others.forEach((group, index) => {
    if (group.category === category) last = index;
  });
  return last < 0 ? undefined : sequenceAt(others, last + 1);
};

type Props = { workspaceSlug: string };

/** Workspace settings, State groups (E30, r9-17): the columns every board shares, each in one of five categories. */
export const StateGroupsSettingsRoot = observer(function StateGroupsSettingsRoot({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const { getStateGroups, fetchStateGroups, createStateGroup, updateStateGroup } = useStateGroup();
  const { allowPermissions } = useUserPermissions();
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<TDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TWorkspaceStateGroup | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const groups = getStateGroups(workspaceSlug);
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  // asked again on every visit, so the counts are current
  useEffect(() => {
    fetchStateGroups(workspaceSlug, true)
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  }, [fetchStateGroups, workspaceSlug]);

  const categoryLabel = (category: TStateGroups) => t(`${K}.categories.${category}`);

  const original = draft?.id ? groups?.find((group) => group.id === draft.id) : undefined;
  const dirty =
    !!draft &&
    !!draft.name.trim() &&
    (!original ||
      original.name !== draft.name.trim() ||
      original.category !== draft.category ||
      original.color !== draft.color);

  const save = async () => {
    if (!draft || !dirty || saving || !isAdmin || !groups) return;
    setSaving(true);
    const name = draft.name.trim();
    const moved = !original || original.category !== draft.category;
    const sequence = moved ? sequenceInCategory(groups, draft.category, draft.id) : undefined;
    const fields = draft.is_builtin
      ? { name }
      : { name, category: draft.category, color: draft.color, ...(sequence !== undefined ? { sequence } : {}) };
    try {
      const saved = draft.id
        ? await updateStateGroup(workspaceSlug, draft.id, fields)
        : await createStateGroup(workspaceSlug, fields);
      setDraft(draftOf(saved));
      setToast({ type: "success", title: t(draft.id ? `${K}.saved` : `${K}.created`) });
    } catch (error) {
      const taken = !!(error as { error?: string } | undefined)?.error?.includes("already exists");
      setToast({ type: "error", title: t(taken ? `${K}.taken` : `${K}.failed`) });
    } finally {
      setSaving(false);
    }
  };

  // ⌘S saves the open editor, as on the priorities page
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!draft || event.key.toLowerCase() !== "s" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Moves a group to `index` among the others: by dragging its handle, or Move up and Move down in its menu. */
  const move = async (id: string, index: number) => {
    if (!groups) return;
    const others = groups.filter((group) => group.id !== id);
    try {
      await updateStateGroup(workspaceSlug, id, { sequence: sequenceAt(others, index) });
    } catch {
      setToast({ type: "error", title: t(`${K}.failed`) });
    }
  };

  const drop = (targetId: string) => {
    const from = groups?.findIndex((group) => group.id === dragging) ?? -1;
    const target = groups?.findIndex((group) => group.id === targetId) ?? -1;
    setDragging(null);
    setOver(null);
    if (!groups || !dragging || from < 0 || target < 0 || from === target) return;
    // dragged down it lands after the row it is dropped on, dragged up before it: either way at the row's index
    void move(dragging, target);
  };

  const draggedIndex = groups?.findIndex((group) => group.id === dragging) ?? -1;

  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsHeading
        title={t(`${K}.title`)}
        description={t(`${K}.description`)}
        control={
          isAdmin && (
            <button
              type="button"
              onClick={() => setDraft({ ...NEW_DRAFT })}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-13 font-medium text-primary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
            >
              <AddOutline className="size-3.5" />
              {t(`${K}.new`)}
            </button>
          )
        }
      />

      {failed && !groups ? (
        <p className="text-13 text-secondary">{t(`${K}.load_failed`)}</p>
      ) : !groups ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-11 animate-pulse rounded-lg bg-layer-2" />
          ))}
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <SettingsBox>
              <div className={cn(ROW, "h-9 border-b border-subtle text-12 text-secondary")}>
                <span />
                <span>{t(`${K}.column_group`)}</span>
                <span className="hidden md:block">{t(`${K}.column_category`)}</span>
                <span className="hidden md:block">{t(`${K}.column_used`)}</span>
                <span />
              </div>
              {groups.map((group, index) => {
                const target = over === group.id && draggedIndex >= 0 && draggedIndex !== index;
                return (
                  <div
                    key={group.id}
                    data-group-row
                    onDragOver={(event) => {
                      if (!dragging) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (over !== group.id) setOver(group.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      drop(group.id);
                    }}
                    className={cn(
                      ROW,
                      "group/row relative min-h-12 border-b border-subtle py-1.5 text-13 last:border-b-0 hover:bg-layer-1-hover",
                      draft?.id === group.id && "bg-layer-1-selected",
                      dragging === group.id && "opacity-50",
                      target &&
                        "before:absolute before:inset-x-0 before:h-0.5 before:bg-accent-primary before:content-['']",
                      target && (draggedIndex < index ? "before:bottom-0" : "before:top-0")
                    )}
                  >
                    {isAdmin ? (
                      <button
                        type="button"
                        draggable
                        aria-label={t(`${K}.drag`, { name: group.name })}
                        title={t(`${K}.drag`, { name: group.name })}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", group.id);
                          const row = event.currentTarget.closest("[data-group-row]");
                          if (row) event.dataTransfer.setDragImage(row, 16, 22);
                          setDragging(group.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        className="grid size-4 cursor-grab place-items-center rounded text-tertiary outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong active:cursor-grabbing"
                      >
                        <GripOutline className="size-3" />
                      </button>
                    ) : (
                      <span />
                    )}
                    <span className="flex min-w-0 items-center gap-2">
                      <WorkspaceStateGroupIcon group={group} className="size-[15px]" />
                      <span className="truncate font-medium text-primary">{group.name}</span>
                      {group.is_builtin ? (
                        <LockOutline
                          className="size-3 shrink-0 text-tertiary"
                          aria-label={t(`${K}.builtin`)}
                          role="img"
                        />
                      ) : (
                        <span className="inline-flex h-5 shrink-0 items-center rounded-md border border-strong px-1.5 text-11 text-secondary">
                          {t(`${K}.custom`)}
                        </span>
                      )}
                    </span>
                    <span className="hidden md:block">
                      <span className="inline-flex h-5 items-center rounded-md border border-strong px-1.5 text-11 text-secondary">
                        {group.category}
                      </span>
                    </span>
                    <span className="hidden text-12 text-secondary tabular-nums md:block">
                      {group.state_count
                        ? t(`${K}.used`, { projects: group.project_count ?? 0, states: group.state_count })
                        : t(`${K}.unused`)}
                    </span>
                    {isAdmin ? (
                      <Menu>
                        <MenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label={t(`${K}.menu`, { name: group.name })}
                              className="grid size-6 place-items-center rounded-md text-secondary outline-none hover:bg-layer-1-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong"
                            >
                              <MoreHorizontalOutline className="size-3.5" />
                            </button>
                          }
                        />
                        <MenuContent side="bottom" align="end">
                          <MenuItem
                            icon={<EditOutline />}
                            label={t(group.is_builtin ? `${K}.rename` : `${K}.edit`)}
                            onClick={() => setDraft(draftOf(group))}
                          />
                          {index > 0 && (
                            <MenuItem
                              icon={<ArrowUpOutline />}
                              label={t(`${K}.move_up`)}
                              onClick={() => void move(group.id, index - 1)}
                            />
                          )}
                          {index < groups.length - 1 && (
                            <MenuItem
                              icon={<ArrowDownOutline />}
                              label={t(`${K}.move_down`)}
                              onClick={() => void move(group.id, index + 1)}
                            />
                          )}
                          {!group.is_builtin && (
                            <MenuItem
                              icon={<DeleteOutline />}
                              label={t(`${K}.delete`)}
                              onClick={() => setDeleting(group)}
                            />
                          )}
                        </MenuContent>
                      </Menu>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </SettingsBox>
            <p className="flex items-start gap-2.5 rounded-[10px] border border-subtle bg-surface-2 px-3 py-2.5 text-12 leading-relaxed text-secondary">
              <StackLayersOutline className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t(`${K}.note_lead`)} <code className="font-code text-primary">stateGroup</code> {t(`${K}.note_rest`)}
              </span>
            </p>
            {!isAdmin && <p className="px-1 text-12 text-tertiary">{t(`${K}.admins_only`)}</p>}
          </section>

          {draft && isAdmin && (
            <StateGroupEditor
              key={draft.id ?? "new"}
              draft={draft}
              categoryLabel={categoryLabel}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={() => void save()}
              canSave={dirty}
              saving={saving}
            />
          )}
        </>
      )}

      {deleting && groups && (
        <StateGroupDeleteDialog
          workspaceSlug={workspaceSlug}
          group={deleting}
          groups={groups}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (draft?.id === deleting.id) setDraft(null);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
});

type EditorProps = {
  draft: TDraft;
  categoryLabel: (category: TStateGroups) => string;
  onChange: (draft: TDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
};

/** The picked group in full: its name, and for a custom one its category and colour. A built-in one keeps its category. */
function StateGroupEditor(props: EditorProps) {
  const { draft, categoryLabel, onChange, onCancel, onSave, canSave, saving } = props;
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const set = (fields: Partial<TDraft>) => onChange({ ...draft, ...fields });

  // opened by New group, rename or edit: the editor comes into view with its name field ready
  useEffect(() => {
    nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  const subtitle = !draft.id
    ? t(`${K}.editor_new`)
    : t(draft.is_builtin ? `${K}.editor_builtin` : `${K}.editor_custom`, {
        category: categoryLabel(draft.category),
      });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-13 font-semibold text-primary">
        <WorkspaceStateGroupIcon
          group={{ category: draft.category, color: draft.color, is_builtin: draft.is_builtin }}
          className="size-3.5"
        />
        <span className="truncate">{draft.name.trim() || t(`${K}.new`)}</span>
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
              onKeyDown={(event) => {
                if (event.key === "Enter") onSave();
              }}
              placeholder={t(`${K}.name_placeholder`)}
              aria-label={t(`${K}.name`)}
              className="h-[30px] w-[220px] rounded-md border border-strong bg-layer-1 px-2.5 text-13 text-primary shadow-e1 outline-none placeholder:text-placeholder focus:border-accent-strong"
            />
          }
        />
        <SettingsRow
          title={t(`${K}.category`)}
          description={t(draft.is_builtin ? `${K}.category_builtin` : `${K}.category_hint`)}
          control={
            draft.is_builtin ? (
              <span className="inline-flex h-5 items-center rounded-md border border-strong px-1.5 text-11 text-secondary">
                {draft.category}
              </span>
            ) : (
              <Segmented
                label={t(`${K}.category`)}
                value={draft.category}
                onChange={(category) => set({ category })}
                options={STATE_GROUP_CATEGORIES.map((category) => ({
                  value: category,
                  label: categoryLabel(category),
                }))}
              />
            )
          }
        />
        {!draft.is_builtin && (
          <SettingsRow
            title={t(`${K}.colour`)}
            description={t(`${K}.colour_hint`)}
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
        )}
      </SettingsBox>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" stretch="auto" label={t(`${K}.cancel`)} onClick={onCancel} />
        <Button
          variant="primary"
          size="sm"
          stretch="auto"
          label={t(draft.id ? `${K}.save` : `${K}.add`)}
          disabled={!canSave}
          loading={saving}
          onClick={onSave}
        />
      </div>
    </section>
  );
}
