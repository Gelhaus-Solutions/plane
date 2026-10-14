/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import type { RefObject } from "react";
import { observer } from "mobx-react";
// plane imports
import { Select, useSelectContext } from "@plane/blocks/select";
import type { SelectVariant } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TEpicSize, TEpicWave } from "@plane/types";
import { EPIC_SIZES } from "@plane/types";
// hooks
import { useEpic } from "@/hooks/store/use-epic";

/** "W4 Process" makes the wave W4 with the theme Process. */
export function parseWave(query: string): Pick<TEpicWave, "code" | "name"> | undefined {
  const [code, ...rest] = query.trim().split(/\s+/);
  if (!code) return undefined;
  return { code: code.slice(0, 16), name: rest.join(" ") };
}

type WaveSelectProps = {
  workspaceSlug: string;
  projectId: string;
  value: string | null | undefined;
  onChange: (waveId: string | null) => void;
  variant: SelectVariant;
  disabled?: boolean;
  className?: string;
};

/** Picks one of the project's waves; typing "W4 Process" and Enter adds a wave. */
export const EpicWaveSelect = observer(function EpicWaveSelect(props: WaveSelectProps) {
  const { workspaceSlug, projectId, value, onChange, variant, disabled = false, className } = props;
  const { t } = useTranslation();
  const { getProjectWaves, createWave } = useEpic();
  const waves = getProjectWaves(projectId) ?? [];
  const selected = waves.find((wave) => wave.id === value) ?? null;
  const closeRef = useRef<(() => void) | undefined>(undefined);

  const addWave = async (query: string, close: () => void) => {
    const data = parseWave(query);
    if (!data) return;
    try {
      const wave = await createWave(workspaceSlug, projectId, data);
      onChange(wave.id);
      close();
    } catch {
      setToast({ type: "error", title: t("epics.wave_select.exists") });
    }
  };

  return (
    <Select<TEpicWave>
      getValues={() => waves}
      value={selected}
      onChange={(id) => onChange(id === value ? null : id || null)}
      disabled={disabled}
      placeholder={t("epics.wave_select.placeholder")}
      searchPlaceholder={t("epics.wave_select.search")}
      pinSelected={false}
      getOptionValue={(wave) => wave.id}
      getOptionLabel={(wave) => wave.name || wave.code}
      getOptionSearchText={(wave) => `${wave.code} ${wave.name}`}
      getOptionIcon={(wave) => <WaveTag code={wave.code} />}
      onSearchSubmit={(query) => void addWave(query, () => closeRef.current?.())}
      footer={<WaveSelectFooter closeRef={closeRef} hint={t("epics.wave_select.create_hint")} />}
    >
      <Select.Trigger<TEpicWave>
        disabled={disabled}
        variant={variant}
        className={className}
        label={(selection) => (selection[0] ? `${selection[0].code} ${selection[0].name}` : "")}
      >
        {(selection) => {
          const wave = selection[0];
          if (!wave) return <span className="text-placeholder">{t("epics.no_wave")}</span>;
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <WaveTag code={wave.code} />
              <span className="truncate">{wave.name}</span>
            </span>
          );
        }}
      </Select.Trigger>
    </Select>
  );
});

/** The hint under the waves; it also hands the dropdown's close to the select, for after a wave is added. */
function WaveSelectFooter(props: { closeRef: RefObject<(() => void) | undefined>; hint: string }) {
  const { close } = useSelectContext();
  props.closeRef.current = close;
  return <p className="border-t border-subtle px-2.5 py-1.5 text-11 text-tertiary">{props.hint}</p>;
}

type SizeOption = { key: TEpicSize };

/** Picks the epic's size, XS to XL; picking the current one clears it. */
export function EpicSizeSelect(props: {
  value: TEpicSize | null | undefined;
  onChange: (size: TEpicSize | null) => void;
  variant: SelectVariant;
  disabled?: boolean;
  className?: string;
}) {
  const { value, onChange, variant, disabled = false, className } = props;
  const { t } = useTranslation();
  const options: SizeOption[] = EPIC_SIZES.map((key) => ({ key }));
  const selected = options.find((option) => option.key === value) ?? null;
  return (
    <Select<SizeOption>
      getValues={() => options}
      value={selected}
      onChange={(key) => onChange(key === value ? null : ((key || null) as TEpicSize | null))}
      disabled={disabled}
      placeholder={t("epics.size_select.placeholder")}
      showSearch={false}
      pinSelected={false}
      getOptionValue={(option) => option.key}
      getOptionLabel={(option) => option.key}
    >
      <Select.Trigger<SizeOption>
        disabled={disabled}
        variant={variant}
        className={className}
        label={(selection) => selection[0]?.key ?? ""}
      >
        {(selection) =>
          selection[0] ? (
            <SizeTag size={selection[0].key} />
          ) : (
            <span className="text-placeholder">{t("epics.size_select.placeholder")}</span>
          )
        }
      </Select.Trigger>
    </Select>
  );
}

/** The bordered mono-ish tag of a wave code or a size (the frame's `tag`). */
export function WaveTag(props: { code: string; strong?: boolean }) {
  return (
    <span
      className={
        props.strong
          ? "inline-flex h-5 shrink-0 items-center rounded-md border border-strong px-1.5 text-[11.5px] font-semibold text-primary"
          : "inline-flex h-5 shrink-0 items-center rounded-md border border-strong px-1.5 text-[11.5px] text-secondary"
      }
    >
      {props.code}
    </span>
  );
}

export function SizeTag(props: { size: string }) {
  return (
    <span className="inline-flex h-5 min-w-[30px] shrink-0 items-center justify-center rounded-md border border-strong px-1.5 text-[11.5px] text-secondary">
      {props.size}
    </span>
  );
}
