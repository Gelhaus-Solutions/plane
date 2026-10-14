/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import {
  AddOutline,
  ChevronDownOutline,
  ChevronRightOutline,
  EpicOutline,
  LayerStackOutline,
  LinkOutline,
  PreferencesOutline,
  SortAscendingOutline,
} from "@makeplane/propel/icons";
// plane imports
import { ProjectBadge } from "@plane/blocks/project-badge";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TEpic, TEpicWave } from "@plane/types";
import { cn, copyTextToClipboard } from "@plane/utils";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useEpic } from "@/hooks/store/use-epic";
import { useProject } from "@/hooks/store/use-project";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
import useLocalStorage from "@/hooks/use-local-storage";
// local imports
import { CreateEpicModal } from "./create-epic-modal";
import { SizeTag, WaveTag } from "./fields";
import {
  EpicHealthCell,
  EpicProgressCell,
  EpicStateIcon,
  EpicWorkingLine,
  Segmented,
  ToolbarChip,
  progressPercent,
  shortDate,
} from "./parts";

type TGroup = "wave" | "none";
type TOrder = "target" | "id" | "progress";
type TColumn = "health" | "lead" | "target" | "size" | "wave";
const OPTIONAL_COLUMNS: TColumn[] = ["health", "lead", "target", "size", "wave"];
const COLUMN_WIDTH: Record<TColumn, string> = {
  health: "100px",
  lead: "140px",
  target: "70px",
  size: "46px",
  wave: "64px",
};

const NO_WAVE = "none";

const byTarget = (a: TEpic, b: TEpic) => {
  if (a.target_date === b.target_date) return a.sequence_id - b.sequence_id;
  if (!a.target_date) return 1;
  if (!b.target_date) return -1;
  return a.target_date < b.target_date ? -1 : 1;
};

/** The list's order: by target date (the frame's default), by ID, or by the share done. */
export function sortEpics(epics: TEpic[], order: TOrder) {
  const compare =
    order === "id"
      ? (a: TEpic, b: TEpic) => a.sequence_id - b.sequence_id
      : order === "progress"
        ? (a: TEpic, b: TEpic) => progressPercent(b.progress) - progressPercent(a.progress) || byTarget(a, b)
        : byTarget;
  // a copy, so the store's list keeps its order
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...epics].sort(compare);
}

type Props = { workspaceSlug: string; projectId: string };

/** The epics of a project (r4-10): grouped by wave, with progress, health, lead, target, size and wave. */
export const ProjectEpicsRoot = observer(function ProjectEpicsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const router = useRouter();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { getProjectById } = useProject();
  const { fetchProjectEpics, fetchWaves, getProjectEpics, getProjectWaves, updateEpicFields } = useEpic();
  // states
  const [waveFilter, setWaveFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { storedValue: group, setValue: setGroup } = useLocalStorage<TGroup>("epics_group", "wave");
  const { storedValue: order, setValue: setOrder } = useLocalStorage<TOrder>("epics_order", "target");
  const { storedValue: hidden, setValue: setHidden } = useLocalStorage<TColumn[]>("epics_hidden_columns", []);
  // derived values
  const project = getProjectById(projectId);
  const epics = getProjectEpics(projectId);
  const projectWaves = getProjectWaves(projectId);
  const waves = useMemo(() => projectWaves ?? [], [projectWaves]);
  const columns = OPTIONAL_COLUMNS.filter((column) => !(hidden ?? []).includes(column));
  const template = `74px minmax(220px,1fr) 230px ${columns.map((column) => COLUMN_WIDTH[column]).join(" ")}`;

  useEffect(() => {
    void fetchProjectEpics(workspaceSlug, projectId);
    void fetchWaves(workspaceSlug, projectId);
  }, [workspaceSlug, projectId, fetchProjectEpics, fetchWaves]);

  const visible = useMemo(() => {
    const list = (epics ?? []).filter((epic) =>
      waveFilter === "all" ? true : (epic.wave_id ?? NO_WAVE) === waveFilter
    );
    return sortEpics(list, order ?? "target");
  }, [epics, waveFilter, order]);

  const groups = useMemo(() => {
    if (group === "none") return [{ id: "all", wave: undefined, epics: visible }];
    const byWave = new Map<string, TEpic[]>();
    for (const epic of visible) {
      const key = epic.wave_id ?? NO_WAVE;
      byWave.set(key, [...(byWave.get(key) ?? []), epic]);
    }
    const ordered: { id: string; wave: TEpicWave | undefined; epics: TEpic[] }[] = waves
      .filter((wave) => byWave.has(wave.id))
      .map((wave) => ({ id: wave.id, wave, epics: byWave.get(wave.id) ?? [] }));
    const rest = byWave.get(NO_WAVE);
    if (rest) ordered.push({ id: NO_WAVE, wave: undefined, epics: rest });
    return ordered;
  }, [group, visible, waves]);

  const epicHref = (epic: TEpic) => `/${workspaceSlug}/projects/${projectId}/epics/${epic.id}`;
  const identifier = (epic: TEpic) => `${project?.identifier ?? ""}-${epic.sequence_id}`;

  const copyLink = () =>
    void copyTextToClipboard(window.location.href).then(() =>
      setToast({ type: "success", title: t("common.link_copied"), compact: true })
    );

  const changeLead = (epic: TEpic, leadId: string) =>
    void updateEpicFields(workspaceSlug, projectId, epic.id, {
      lead_id: leadId === epic.lead_id ? null : leadId || null,
    }).catch(() => setToast({ type: "error", title: t("epics.update_failed") }));

  const groupLabel = { wave: t("epics.group.wave"), none: t("epics.group.none") };
  const orderLabel = { target: t("epics.order.target"), id: t("epics.order.id"), progress: t("epics.order.progress") };

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <CreateEpicModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        defaultWaveId={waveFilter !== "all" && waveFilter !== NO_WAVE ? waveFilter : undefined}
      />
      <header className="flex shrink-0 flex-col gap-2 px-[18px] pt-3 pb-2.5">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {sidebarCollapsed && projectPreferences.navigationMode !== "TABBED" && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            {project && (
              <Link
                href={`/${workspaceSlug}/projects/${projectId}/issues/`}
                className="flex min-w-0 items-center gap-1.5 hover:text-primary"
              >
                <ProjectBadge name={project.name} seed={project.id} logo={project.logo_props} />
                <span className="truncate">{project.name}</span>
              </Link>
            )}
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-primary">{t("epics.title")}</span>
          </nav>
          <span className="flex-1" />
          <Tooltip label={t("copy_link")} side="bottom">
            <IconButton
              size="md"
              variant="ghost"
              icon={<Icon icon={LinkOutline} />}
              aria-label={t("copy_link")}
              onClick={copyLink}
            />
          </Tooltip>
        </div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">{t("epics.title")}</h1>
          {epics && (
            <span className="rounded-[5px] bg-layer-2 px-[7px] text-12 leading-5 text-secondary tabular-nums">
              {t("epics.count", { count: epics.length })}
            </span>
          )}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-strong px-[18px] py-2">
        <Segmented
          label={t("epics.columns.wave")}
          value={waveFilter}
          onChange={setWaveFilter}
          options={[
            { value: "all", label: t("epics.all") },
            ...waves.map((wave) => ({ value: wave.id, label: wave.code })),
          ]}
        />
        <Menu>
          <MenuTrigger
            render={
              <button type="button" className="rounded-[10px] outline-none focus-visible:ring-2">
                <ToolbarChip icon={<LayerStackOutline />}>
                  {t("epics.group.label", { value: groupLabel[group ?? "wave"] })}
                </ToolbarChip>
              </button>
            }
          />
          <MenuContent side="bottom" align="start">
            {(["wave", "none"] as const).map((option) => (
              <MenuItem
                key={option}
                label={groupLabel[option]}
                selected={(group ?? "wave") === option}
                onClick={() => setGroup(option)}
              />
            ))}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger
            render={
              <button type="button" className="rounded-[10px] outline-none focus-visible:ring-2">
                <ToolbarChip icon={<SortAscendingOutline />}>
                  {t("epics.order.label", { value: orderLabel[order ?? "target"] })}
                </ToolbarChip>
              </button>
            }
          />
          <MenuContent side="bottom" align="start">
            {(["target", "id", "progress"] as const).map((option) => (
              <MenuItem
                key={option}
                label={orderLabel[option]}
                selected={(order ?? "target") === option}
                onClick={() => setOrder(option)}
              />
            ))}
          </MenuContent>
        </Menu>
        <span className="flex-1" />
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="secondary"
                size="md"
                stretch="auto"
                icon={<PreferencesOutline className="size-3.5 text-secondary" />}
                label={t("common.display")}
              />
            }
          />
          <MenuContent side="bottom" align="end">
            <MenuGroup>
              <MenuLabel>{t("common.display")}</MenuLabel>
              {OPTIONAL_COLUMNS.map((column) => (
                <MenuCheckboxItem
                  key={column}
                  label={t(`epics.columns.${column}`)}
                  checked={columns.includes(column)}
                  onCheckedChange={(checked) =>
                    setHidden(checked ? (hidden ?? []).filter((item) => item !== column) : [...(hidden ?? []), column])
                  }
                />
              ))}
            </MenuGroup>
          </MenuContent>
        </Menu>
        <Button
          variant="primary"
          size="md"
          stretch="auto"
          icon={<AddOutline className="size-3.5" />}
          label={t("epics.new_epic")}
          onClick={() => setIsCreateOpen(true)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {epics && epics.length === 0 ? (
          <EpicsEmpty onCreate={() => setIsCreateOpen(true)} />
        ) : (
          <div className="min-w-[1000px]">
            <div
              role="row"
              className="sticky top-0 z-[5] grid h-[30px] items-center gap-x-3 border-b border-strong bg-surface-1 px-[18px] text-[11.5px] font-medium text-secondary"
              style={{ gridTemplateColumns: template }}
            >
              <span>{t("epics.columns.id")}</span>
              <span>{t("epics.columns.epic")}</span>
              <span>{t("epics.columns.progress")}</span>
              {columns.map((column) => (
                <span key={column}>{t(`epics.columns.${column}`)}</span>
              ))}
            </div>
            {!epics && <EpicRowsSkeleton />}
            {epics && visible.length === 0 && (
              <p className="px-[18px] py-6 text-13 text-secondary">{t("epics.empty.filtered")}</p>
            )}
            {groups.map((section) => {
              const isCollapsed = !!collapsed[section.id];
              return (
                <div key={section.id}>
                  {group !== "none" && (
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((state) => ({ ...state, [section.id]: !isCollapsed }))}
                      className="sticky top-[30px] z-[3] flex h-[34px] w-full items-center gap-2 border-b border-subtle bg-surface-2 px-[18px] text-left text-13"
                    >
                      <ChevronDownOutline
                        className={cn("size-3 shrink-0 text-secondary transition-transform", {
                          "-rotate-90": isCollapsed,
                        })}
                      />
                      {section.wave ? (
                        <>
                          <WaveTag code={section.wave.code} strong />
                          <span className="font-semibold text-primary">{section.wave.name}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-primary">{t("epics.no_wave")}</span>
                      )}
                      <span className="text-secondary tabular-nums">{section.epics.length}</span>
                    </button>
                  )}
                  {!isCollapsed &&
                    section.epics.map((epic) => {
                      const wave = waves.find((item) => item.id === epic.wave_id);
                      return (
                        // The row is a larger target for the pointer; the epic's link is the keyboard path
                        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
                        <div
                          key={epic.id}
                          role="row"
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("button, a, [role=combobox], [role=menu]"))
                              return;
                            router.push(epicHref(epic));
                          }}
                          className="grid min-h-12 cursor-pointer items-center gap-x-3 border-b border-subtle px-[18px] py-1 text-13 transition-colors duration-[120ms] hover:bg-layer-1-hover"
                          style={{ gridTemplateColumns: template }}
                        >
                          <span className="font-code text-12 text-secondary">{identifier(epic)}</span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <Link
                              href={epicHref(epic)}
                              className="flex min-w-0 items-center gap-2 font-semibold text-primary"
                            >
                              <EpicStateIcon group={epic.state_group} />
                              <span className="truncate">{epic.name}</span>
                            </Link>
                            {epic.working && (
                              <EpicWorkingLine
                                name={epic.working.display_name}
                                identifier={`${project?.identifier ?? ""}-${epic.working.sequence_id}`}
                              />
                            )}
                          </span>
                          <EpicProgressCell progress={epic.progress} width={150} />
                          {columns.map((column) => {
                            if (column === "health") return <EpicHealthCell key={column} epic={epic} />;
                            if (column === "lead")
                              return (
                                <span key={column} className="min-w-0">
                                  <MemberSelect
                                    value={epic.lead_id}
                                    onChange={(id) => changeLead(epic, id)}
                                    projectId={projectId}
                                    placeholder={t("epics.no_lead")}
                                    variant="select-ghost-md"
                                    showLabel
                                    className="max-w-full"
                                  />
                                </span>
                              );
                            if (column === "target")
                              return (
                                <span key={column} className="text-12 text-secondary">
                                  {shortDate(epic.target_date)}
                                </span>
                              );
                            if (column === "size")
                              return <span key={column}>{epic.size && <SizeTag size={epic.size} />}</span>;
                            return (
                              <span key={column} className="text-12 text-secondary">
                                {wave?.code ?? ""}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

function EpicRowsSkeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex h-12 items-center gap-4 border-b border-subtle px-[18px]">
          <span className="h-3 w-14 rounded bg-layer-2" />
          <span className="h-3 w-56 rounded bg-layer-2" />
          <span className="h-1.5 w-[150px] rounded-full bg-layer-2" />
        </div>
      ))}
    </div>
  );
}

function EpicsEmpty(props: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="grid size-10 place-items-center rounded-xl border border-strong bg-surface-2 text-secondary">
        <EpicOutline className="size-5" />
      </span>
      <h2 className="text-15 font-semibold text-primary">{t("epics.empty.title")}</h2>
      <p className="text-13 text-secondary">{t("epics.empty.description")}</p>
      <Button
        variant="primary"
        size="md"
        stretch="auto"
        icon={<AddOutline className="size-3.5" />}
        label={t("epics.new_epic")}
        onClick={props.onCreate}
      />
    </div>
  );
}
