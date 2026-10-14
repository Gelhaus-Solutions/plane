/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { format } from "date-fns";
import { observer } from "mobx-react";
import { Switch } from "@makeplane/propel/components/switch";
import { CalendarOutline, ChevronDownOutline, ExportOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ProjectBadge } from "@plane/blocks/project-badge";
import { DateRangeSelect } from "@plane/blocks/property-select";
import { Select } from "@plane/blocks/select";
import type { TLogoProps } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import { Segmented } from "../charts/cards";
import { useExportCsv } from "./export";
import { PRESET_DAYS, useInsightsFilters } from "./use-insights";

type TProjectOption = { id: string; name: string; query: string; logo_props?: TLogoProps };

/** The period and projects every tab reads (r5-10's toolbar), with the comparison switch and Export CSV */
export const AnalyticsFilterBar = observer(function AnalyticsFilterBar() {
  const { t } = useTranslation();
  const { period, range, projectIds, compare, update } = useInsightsFilters();
  const exportCsv = useExportCsv();
  const { workspaceProjectIds, getProjectById } = useProject();

  const options = useMemo<TProjectOption[]>(
    () =>
      (workspaceProjectIds ?? []).map((id) => {
        const project = getProjectById(id);
        return project
          ? { id, name: project.name, query: `${project.name} ${project.identifier}`, logo_props: project.logo_props }
          : { id, name: id, query: id };
      }),
    [workspaceProjectIds, getProjectById]
  );
  const selected = useMemo(() => options.filter((o) => projectIds.includes(o.id)), [options, projectIds]);
  // the badges show the picked projects, or the first few of all of them
  const badges = (selected.length ? selected : options).slice(0, 3);

  const periodOptions = [
    ...PRESET_DAYS.map((days) => ({
      value: days as string,
      label: t("workspace_analytics.insights.days", { count: days }),
    })),
    { value: "custom", label: t("workspace_analytics.insights.custom") },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-strong px-[18px] py-2">
      <Segmented
        label={t("workspace_analytics.insights.period")}
        options={periodOptions}
        value={period}
        onChange={(value) =>
          update(value === "custom" ? { period: value, ...range } : { period: value, start: null, end: null })
        }
      />
      <DateRangeSelect
        variant="select-md"
        className="w-auto"
        icon={<CalendarOutline />}
        value={{ from: getDate(range.start) ?? null, to: getDate(range.end) ?? null }}
        maxDate={new Date()}
        onChange={({ from, to }) => {
          if (!from || !to) return;
          update({
            period: "custom",
            start: renderFormattedPayloadDate(from) ?? null,
            end: renderFormattedPayloadDate(to) ?? null,
          });
        }}
        formatLabel={({ from, to }) =>
          from && to
            ? t("workspace_analytics.insights.range", { from: format(from, "MMM d"), to: format(to, "MMM d") })
            : ""
        }
      />
      <Select<TProjectOption>
        multiple
        getValues={() => options}
        value={selected}
        onChange={(ids) => update({ projects: ids?.length ? ids.join(",") : null })}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        getOptionSearchText={(option) => option.query}
        getOptionIcon={(option) => <ProjectBadge name={option.name} seed={option.id} logo={option.logo_props} />}
      >
        <Select.Trigger<TProjectOption> variant="select-md" className="w-auto" appendIcon={<ChevronDownOutline />}>
          {() => (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="flex shrink-0 items-center gap-0.5">
                {badges.map((option) => (
                  <ProjectBadge
                    key={option.id}
                    name={option.name}
                    seed={option.id}
                    logo={option.logo_props}
                    size={14}
                  />
                ))}
              </span>
              <span className="truncate text-primary">
                {selected.length === 0
                  ? t("workspace_analytics.insights.all_projects")
                  : selected.length === 1
                    ? selected[0].name
                    : t("workspace_analytics.insights.projects_count", { count: selected.length })}
              </span>
            </span>
          )}
        </Select.Trigger>
      </Select>
      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-secondary">
        <Switch size="sm" checked={compare} onCheckedChange={(on) => update({ compare: on ? "1" : null })} />
        {t("workspace_analytics.insights.compare")}
      </label>
      <span className="flex-1" />
      <button
        type="button"
        onClick={exportCsv}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-strong bg-layer-1 px-2.5 text-[12.5px] font-medium text-primary shadow-e1 transition-colors hover:bg-layer-1-hover"
      >
        <ExportOutline className="size-3.5 text-secondary" />
        {t("workspace_analytics.insights.export")}
      </button>
    </div>
  );
});
