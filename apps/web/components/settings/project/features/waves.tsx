/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { AddOutline, ChevronDownOutline, ChevronUpOutline, DeleteOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setToast } from "@plane/blocks/toast";
import type { TEpicWave } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useEpic } from "@/hooks/store/use-epic";

const K = "project_settings.features_page.epics";

const FIELD =
  "h-7 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-13 text-primary outline-none hover:border-strong focus:border-accent-strong focus:bg-layer-1";

/** A field that saves its text when it loses focus or on Enter, and puts it back on Escape. */
function WaveField(props: {
  value: string;
  label: string;
  mono?: boolean;
  className?: string;
  onSave: (value: string) => Promise<unknown>;
}) {
  const { value, label, mono = false, className, onSave } = props;
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // a new value from the store replaces the draft
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (next === value) return;
    if (!next && mono) {
      setDraft(value);
      return;
    }
    onSave(next).catch(() => setDraft(value));
  };
  return (
    <input
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(FIELD, mono && "font-code text-12", className)}
    />
  );
}

type Props = { workspaceSlug: string; projectId: string };

/** The Epics box's waves (D44): add, rename the code or theme, reorder and delete. */
export const EpicWavesEditor = observer(function EpicWavesEditor(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { getProjectWaves, fetchWaves, createWave, updateWave, deleteWave } = useEpic();
  useSWR(`EPIC_WAVES_${projectId}`, () => fetchWaves(workspaceSlug, projectId), { revalidateOnFocus: false });
  const waves = getProjectWaves(projectId) ?? [];
  const [code, setCode] = useState("");
  const [theme, setTheme] = useState("");

  // a refused code comes back as { code: ... }
  const showError = (error: unknown) => {
    const exists = !!error && typeof error === "object" && "code" in error;
    setToast({ type: "error", title: exists ? t(`${K}.exists`) : t("project_settings.features_page.save_failed") });
  };

  const save = (wave: TEpicWave, data: Partial<Pick<TEpicWave, "code" | "name" | "sort_order">>) =>
    updateWave(workspaceSlug, projectId, wave.id, data).catch((error: unknown) => {
      showError(error);
      throw error;
    });

  // moving swaps the two neighbours' places in the order
  const move = (index: number, by: -1 | 1) => {
    const wave = waves[index];
    const other = waves[index + by];
    if (!wave || !other) return;
    void save(wave, { sort_order: other.sort_order })
      .then(() => save(other, { sort_order: wave.sort_order }))
      .catch(() => undefined);
  };

  const add = () => {
    const next = code.trim();
    if (!next) return;
    createWave(workspaceSlug, projectId, { code: next, name: theme.trim() })
      .then(() => {
        setCode("");
        setTheme("");
        return undefined;
      })
      .catch(showError);
  };

  return (
    <div className="border-b border-subtle px-3.5 py-2.5 last:border-b-0">
      <div className="text-13 font-medium text-primary">{t(`${K}.waves`)}</div>
      <div className="mt-0.5 text-12 leading-[1.45] text-secondary">{t(`${K}.waves_hint`)}</div>
      <ol className="mt-2 flex flex-col">
        {waves.length === 0 && <li className="py-1.5 text-12 text-tertiary">{t(`${K}.empty`)}</li>}
        {waves.map((wave, index) => (
          <li key={wave.id} className="group flex items-center gap-1.5 py-0.5">
            <WaveField
              value={wave.code}
              label={t(`${K}.code`)}
              mono
              className="w-20 shrink-0"
              onSave={(value) => save(wave, { code: value })}
            />
            <WaveField
              value={wave.name}
              label={t(`${K}.theme`)}
              className="flex-1"
              onSave={(value) => save(wave, { name: value })}
            />
            <span className="flex items-center opacity-0 transition-opacity duration-[120ms] group-focus-within:opacity-100 group-hover:opacity-100">
              <IconButton
                size="sm"
                variant="ghost"
                icon={<Icon icon={ChevronUpOutline} />}
                aria-label={t(`${K}.move_up`, { wave: wave.code })}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                size="sm"
                variant="ghost"
                icon={<Icon icon={ChevronDownOutline} />}
                aria-label={t(`${K}.move_down`, { wave: wave.code })}
                disabled={index === waves.length - 1}
                onClick={() => move(index, 1)}
              />
              <IconButton
                size="sm"
                variant="ghost"
                icon={<Icon icon={DeleteOutline} />}
                aria-label={t(`${K}.delete`, { wave: wave.code })}
                onClick={() => void deleteWave(workspaceSlug, projectId, wave.id).catch(showError)}
              />
            </span>
          </li>
        ))}
      </ol>
      <form
        className="mt-1 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("epics.wave_select.code_placeholder")}
          aria-label={t(`${K}.code`)}
          className={cn(FIELD, "w-20 shrink-0 border-strong font-code text-12")}
        />
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder={t("epics.wave_select.name_placeholder")}
          aria-label={t(`${K}.theme`)}
          className={cn(FIELD, "flex-1 border-strong")}
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-strong bg-layer-1 px-2.5 text-12 font-medium text-primary shadow-e1 hover:bg-layer-1-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AddOutline className="size-3.5" />
          {t(`${K}.add`)}
        </button>
      </form>
    </div>
  );
});
