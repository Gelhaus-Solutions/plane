/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { Switch } from "@makeplane/propel/components/switch";
import {
  CyclesOutline,
  EpicOutline,
  IntakeOutline,
  ModuleOutline,
  PagesOutline,
  ViewsOutline,
} from "@makeplane/propel/icons";
// plane imports
import { MODULE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ModuleStatusIcon, StateGroupIcon } from "@plane/blocks/icons";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import type { IProject, TIntakeAssignee, TModuleDefaultLead, TModuleStatus } from "@plane/types";
// components
import { SettingsBox, SettingsRow } from "@/components/settings/group";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// local imports
import { EpicWavesEditor } from "./waves";

const K = "project_settings.features_page";

type TFeatureKey = "cycle_view" | "module_view" | "issue_views_view" | "page_view" | "intake_view" | "epic_view";

type TOption = { id: string; label: string; icon?: React.ReactNode };

/** A bordered select for one setting, as the Display menu draws its selects. */
function SettingSelect(props: { label: string; value: string; options: TOption[]; onChange: (id: string) => void }) {
  const { label, value, options, onChange } = props;
  const selected = options.find((option) => option.id === value);
  return (
    <Select<TOption>
      getValues={() => options}
      value={selected ?? null}
      onChange={(id) => onChange(String(id ?? ""))}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.label}
      getOptionIcon={(option) => option.icon}
      showSearch={false}
      pinSelected={false}
    >
      <Select.Trigger
        variant="select-md"
        aria-label={label}
        className="h-[30px] min-w-[170px] border border-strong bg-layer-1 shadow-e1"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-primary">
          {selected?.icon}
          <span className="truncate">{selected?.label}</span>
        </span>
      </Select.Trigger>
    </Select>
  );
}

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** only the switches, in one box: the step after creating a project */
  switchesOnly?: boolean;
};

/**
 * The project's Features page (D45, after r9-19's Features tab): every feature is a box with its switch in the head
 * and its settings under it while it is on.
 */
export const ProjectFeaturesSettings = observer(function ProjectFeaturesSettings(props: Props) {
  const { workspaceSlug, projectId, switchesOnly = false } = props;
  const { t } = useTranslation();
  const { getProjectById, updateProject } = useProject();
  const { getProjectStates, fetchProjectStates } = useProjectState();
  const project = getProjectById(projectId);
  useSWR(!switchesOnly && workspaceSlug && projectId ? `PROJECT_STATES_${projectId}` : null, () =>
    fetchProjectStates(workspaceSlug, projectId)
  );

  if (!project) return null;

  const save = (data: Partial<IProject>) =>
    updateProject(workspaceSlug, projectId, data)
      .then(() => setToast({ type: "success", title: t(`${K}.saved`), compact: true }))
      .catch(() => setToast({ type: "error", title: t(`${K}.save_failed`) }));

  // intake travels as inbox_view, the API's name for intake_view
  const isOn = (key: TFeatureKey) => (key === "intake_view" ? !!project.inbox_view : !!project[key]);
  const toggle = (key: TFeatureKey) => {
    const next = !isOn(key);
    void save(key === "intake_view" ? { inbox_view: next } : ({ [key]: next } as Partial<IProject>));
  };

  const weekdays: TOption[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    id: String(day),
    label: t(`${K}.weekdays.${day}`),
  }));
  const weeks: TOption[] = [1, 2, 3, 4].map((count) => ({
    id: String(count),
    label: t(`${K}.cycles.weeks`, { count }),
  }));
  const months: TOption[] = [0, 1, 2, 3, 6, 9, 12].map((count) => ({
    id: String(count),
    label: count ? t(`${K}.after_months`, { count }) : t(`${K}.never`),
  }));
  const days: TOption[] = [0, 7, 14, 30, 60, 90].map((count) => ({
    id: String(count),
    label: count ? t(`${K}.after_days`, { count }) : t(`${K}.never`),
  }));
  const moduleLeads: TOption[] = (["none", "project_lead"] as TModuleDefaultLead[]).map((id) => ({
    id,
    label: t(`${K}.modules.${id === "none" ? "nobody" : id}`),
  }));
  const moduleStatuses: TOption[] = MODULE_STATUS.map((status) => ({
    id: status.value,
    label: t(status.i18n_label),
    icon: <ModuleStatusIcon status={status.value} height="14px" width="14px" />,
  }));
  const intakeAssignees: TOption[] = (["default_assignee", "project_lead", "none"] as TIntakeAssignee[]).map((id) => ({
    id,
    label: t(`${K}.intake.${id === "none" ? "nobody" : id}`),
  }));
  const states = getProjectStates(projectId) ?? [];
  const defaultState = states.find((state) => state.default);
  const acceptedStates: TOption[] = [
    {
      id: "",
      label: defaultState ? `${t(`${K}.intake.default_state`)} (${defaultState.name})` : t(`${K}.intake.default_state`),
    },
    ...states.map((state) => ({
      id: state.id,
      label: state.name,
      icon: <StateGroupIcon stateGroup={state.group} color={state.color} size="sm" />,
    })),
  ];

  const feature = (
    key: TFeatureKey,
    name: string,
    icon: React.ReactNode,
    settings?: React.ReactNode
  ): React.ReactNode => {
    const head = (
      <SettingsRow
        key={key}
        title={
          <span className="flex items-center gap-2">
            <span className="text-secondary">{icon}</span>
            {t(`${K}.${name}.name`)}
          </span>
        }
        description={t(`${K}.${name}.description`)}
        control={
          <Switch
            size="sm"
            checked={isOn(key)}
            onCheckedChange={() => toggle(key)}
            aria-label={t(`${K}.toggle`, { feature: t(`${K}.${name}.name`) })}
          />
        }
      />
    );
    if (switchesOnly) return head;
    return (
      <SettingsBox key={key}>
        {head}
        {isOn(key) && settings}
      </SettingsBox>
    );
  };

  const features = [
    feature(
      "cycle_view",
      "cycles",
      <CyclesOutline className="size-3.5" />,
      <>
        <SettingsRow
          title={t(`${K}.cycles.length`)}
          description={t(`${K}.cycles.length_hint`)}
          control={
            <SettingSelect
              label={t(`${K}.cycles.length`)}
              value={String(project.cycle_length_weeks ?? 2)}
              options={weeks}
              onChange={(id) => void save({ cycle_length_weeks: Number(id) })}
            />
          }
        />
        <SettingsRow
          title={t(`${K}.cycles.start_day`)}
          control={
            <SettingSelect
              label={t(`${K}.cycles.start_day`)}
              value={String(project.cycle_start_day ?? 0)}
              options={weekdays}
              onChange={(id) => void save({ cycle_start_day: Number(id) })}
            />
          }
        />
        <SettingsRow
          title={t(`${K}.cycles.carry_over`)}
          description={t(`${K}.cycles.carry_over_hint`)}
          control={
            <Switch
              size="sm"
              checked={!!project.cycle_auto_carry_over}
              onCheckedChange={(checked) => void save({ cycle_auto_carry_over: checked })}
              aria-label={t(`${K}.cycles.carry_over`)}
            />
          }
        />
        <SettingsRow
          title={t(`${K}.cycles.archive`)}
          description={t(`${K}.cycles.archive_hint`)}
          control={
            <SettingSelect
              label={t(`${K}.cycles.archive`)}
              value={String(project.cycle_archive_in ?? 0)}
              options={months}
              onChange={(id) => void save({ cycle_archive_in: Number(id) })}
            />
          }
        />
      </>
    ),
    feature(
      "module_view",
      "modules",
      <ModuleOutline className="size-3.5" />,
      <>
        <SettingsRow
          title={t(`${K}.modules.lead`)}
          control={
            <SettingSelect
              label={t(`${K}.modules.lead`)}
              value={project.module_default_lead ?? "none"}
              options={moduleLeads}
              onChange={(id) => void save({ module_default_lead: id as TModuleDefaultLead })}
            />
          }
        />
        <SettingsRow
          title={t(`${K}.modules.status`)}
          control={
            <SettingSelect
              label={t(`${K}.modules.status`)}
              value={project.module_default_status ?? "backlog"}
              options={moduleStatuses}
              onChange={(id) => void save({ module_default_status: id as TModuleStatus })}
            />
          }
        />
      </>
    ),
    feature("issue_views_view", "views", <ViewsOutline className="size-3.5" />),
    feature("page_view", "pages", <PagesOutline className="size-3.5" />),
    feature(
      "intake_view",
      "intake",
      <IntakeOutline className="size-3.5" />,
      <>
        <SettingsRow
          title={t(`${K}.intake.assignee`)}
          control={
            <SettingSelect
              label={t(`${K}.intake.assignee`)}
              value={project.intake_assignee ?? "default_assignee"}
              options={intakeAssignees}
              onChange={(id) => void save({ intake_assignee: id as TIntakeAssignee })}
            />
          }
        />
        <SettingsRow
          title={t(`${K}.intake.accepted_state`)}
          control={
            <SettingSelect
              label={t(`${K}.intake.accepted_state`)}
              value={project.intake_accepted_state ?? ""}
              options={acceptedStates}
              onChange={(id) => void save({ intake_accepted_state: id || null })}
            />
          }
        />
        <SettingsRow
          title={t(`${K}.intake.decline`)}
          description={t(`${K}.intake.decline_hint`)}
          control={
            <SettingSelect
              label={t(`${K}.intake.decline`)}
              value={String(project.intake_decline_after_days ?? 0)}
              options={days}
              onChange={(id) => void save({ intake_decline_after_days: Number(id) })}
            />
          }
        />
      </>
    ),
    feature(
      "epic_view",
      "epics",
      <EpicOutline className="size-3.5" />,
      <EpicWavesEditor workspaceSlug={workspaceSlug} projectId={projectId} />
    ),
  ];

  if (switchesOnly) return <SettingsBox>{features}</SettingsBox>;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-1">
        <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">{t(`${K}.title`)}</h1>
        <p className="text-13 leading-normal text-secondary">{t(`${K}.description`, { project: project.name })}</p>
      </div>
      <div className="flex flex-col gap-3">{features}</div>
      <p className="text-12 text-tertiary">{t(`${K}.note`)}</p>
    </div>
  );
});
