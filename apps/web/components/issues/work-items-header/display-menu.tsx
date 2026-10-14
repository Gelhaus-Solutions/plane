/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { Switch } from "@makeplane/propel/components/switch";
import { PreferencesOutline } from "@makeplane/propel/icons";
// plane imports
import { ISSUE_GROUP_BY_OPTIONS, ISSUE_LAYOUT_MAP, ISSUE_ORDER_BY_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Select } from "@plane/blocks/select";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  ILayoutDisplayFiltersOptions,
  TIssueGroupByOptions,
  TIssueOrderByOptions,
} from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";

const LAYOUTS = [
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
  EIssueLayoutTypes.GANTT,
  EIssueLayoutTypes.SPREADSHEET,
];

// r4-03's property chips in its order, then the ones Plane has that the frame leaves out
const PROPERTIES: { key: keyof IIssueDisplayProperties; label: string }[] = [
  { key: "key", label: "id" },
  { key: "priority", label: "priority" },
  { key: "state", label: "state" },
  { key: "assignee", label: "assignee" },
  { key: "labels", label: "labels" },
  { key: "cycle", label: "cycle" },
  { key: "modules", label: "module" },
  { key: "start_date", label: "start" },
  { key: "due_date", label: "due" },
  { key: "estimate", label: "estimate" },
  { key: "sub_issue_count", label: "sub_items" },
  { key: "link", label: "links" },
  { key: "attachment_count", label: "attachments" },
  { key: "created_on", label: "created" },
  { key: "updated_on", label: "updated" },
  { key: "issue_type", label: "type" },
];

const K = "work_items_header.display";

type TOption = { id: string; label: string };

function Row(props: { label: string; value: string; options: TOption[]; onChange: (id: string) => void }) {
  const { label, value, options, onChange } = props;
  return (
    <div className="mx-1 flex h-8 items-center gap-[9px] rounded-[7px] px-2.5 text-[12.5px]">
      <span className="w-24 shrink-0 text-secondary">{label}</span>
      <Select<TOption>
        getValues={() => options}
        value={options.find((o) => o.id === value) ?? null}
        onChange={(id) => onChange(String(id ?? ""))}
        getOptionValue={(o) => o.id}
        getOptionLabel={(o) => o.label}
        showSearch={false}
        pinSelected={false}
      >
        <Select.Trigger variant="select-md" className="h-[26px] flex-1 border border-strong bg-layer-1 shadow-e1">
          <span className="flex-1 truncate text-left text-primary">{options.find((o) => o.id === value)?.label}</span>
        </Select.Trigger>
      </Select>
    </div>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mx-1 flex h-[30px] cursor-pointer items-center gap-[9px] rounded-[7px] px-2.5 text-[12.5px] text-primary hover:bg-layer-1-hover">
      <span className="flex-1">{props.label}</span>
      <Switch size="sm" checked={props.checked} onCheckedChange={props.onChange} />
    </label>
  );
}

type Props = {
  layout: EIssueLayoutTypes | undefined;
  onLayoutChange: (layout: EIssueLayoutTypes) => void;
  layoutOptions: ILayoutDisplayFiltersOptions | undefined;
  displayFilters: IIssueDisplayFilterOptions;
  displayProperties: IIssueDisplayProperties;
  onDisplayFilters: (filters: Partial<IIssueDisplayFilterOptions>) => void;
  onDisplayProperties: (properties: Partial<IIssueDisplayProperties>) => void;
  cycleViewDisabled?: boolean;
  moduleViewDisabled?: boolean;
};

/**
 * The Display menu (r4-03): the layout, grouping and order, the switches for sub-items and empty groups, and the
 * properties as chips. What a layout cannot use is left out.
 */
export const WorkItemsDisplayMenu = observer(function WorkItemsDisplayMenu(props: Props) {
  const {
    layout,
    onLayoutChange,
    layoutOptions,
    displayFilters,
    displayProperties,
    onDisplayFilters,
    onDisplayProperties,
    cycleViewDisabled = false,
    moduleViewDisabled = false,
  } = props;
  const { t } = useTranslation();
  const filters = layoutOptions?.display_filters;
  const extras = layoutOptions?.extra_options?.access ? layoutOptions.extra_options.values : [];
  const available = layoutOptions?.display_properties ?? [];

  const groupOptions = (keys: TIssueGroupByOptions[] | undefined, without?: TIssueGroupByOptions) =>
    ISSUE_GROUP_BY_OPTIONS.filter((o) => keys?.includes(o.key) && (o.key === null || o.key !== without)).map((o) => ({
      id: o.key ?? "",
      label: t(o.titleTranslationKey),
    }));
  const orderOptions = ISSUE_ORDER_BY_OPTIONS.filter((o) => filters?.order_by?.includes(o.key)).map((o) => ({
    id: o.key,
    label: t(o.titleTranslationKey),
  }));
  const properties = PROPERTIES.filter(
    (p) =>
      available.includes(p.key) &&
      !(p.key === "cycle" && cycleViewDisabled) &&
      !(p.key === "modules" && moduleViewDisabled)
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-strong bg-layer-1 px-2.5 text-[12.5px] font-medium text-primary shadow-e1 transition-[background,box-shadow] duration-[120ms] outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong data-[popup-open]:border-accent-strong data-[popup-open]:shadow-[0_0_0_3px_var(--bg-accent-subtle)]"
          >
            <PreferencesOutline className="size-3.5 text-secondary group-data-[popup-open]:text-accent-primary" />
            {t("common.display")}
          </button>
        }
      />
      <PopoverContent side="bottom" align="end" sideOffset={8}>
        {/* the rich popup pads by 16 px; the menu runs to its edges as r4-03 draws it */}
        <div className="-m-4 w-[360px] rounded-[inherit] bg-popover py-2 backdrop-blur-[14px]">
          <div className="px-3 pt-0.5 pb-2">
            <div
              role="group"
              aria-label={t("work_items_header.layouts")}
              className="flex w-full items-center gap-0.5 rounded-lg bg-layer-2 p-0.5"
            >
              {LAYOUTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={t(ISSUE_LAYOUT_MAP[option].i18n_label)}
                  aria-pressed={layout === option}
                  onClick={() => layout !== option && onLayoutChange(option)}
                  className={cn(
                    "flex h-6 flex-1 items-center justify-center rounded-md text-secondary transition-colors duration-[120ms] hover:text-primary",
                    { "bg-surface-1 text-primary shadow-e1 ring-1 ring-(--border-strong)": layout === option }
                  )}
                >
                  <IssueLayoutIcon layout={option} className="size-3.5" />
                </button>
              ))}
            </div>
          </div>
          {filters?.group_by && (
            <Row
              label={t(`${K}.group_by`)}
              value={displayFilters.group_by ?? ""}
              options={groupOptions(filters.group_by)}
              onChange={(id) => onDisplayFilters({ group_by: (id || null) as TIssueGroupByOptions })}
            />
          )}
          {filters?.sub_group_by && displayFilters.group_by && (
            <Row
              label={t(`${K}.sub_group`)}
              value={displayFilters.sub_group_by ?? ""}
              options={groupOptions(filters.sub_group_by, displayFilters.group_by)}
              onChange={(id) => onDisplayFilters({ sub_group_by: (id || null) as TIssueGroupByOptions })}
            />
          )}
          {orderOptions.length > 0 && (
            <Row
              label={t(`${K}.order_by`)}
              value={displayFilters.order_by ?? "sort_order"}
              options={orderOptions}
              onChange={(id) => onDisplayFilters({ order_by: id as TIssueOrderByOptions })}
            />
          )}
          {extras.length > 0 && (
            <>
              <div className="bg-subtle my-1 h-px" />
              {extras.includes("sub_issue") && (
                <Toggle
                  label={t(`${K}.show_sub_items`)}
                  checked={!!displayFilters.sub_issue}
                  onChange={(checked) => onDisplayFilters({ sub_issue: checked })}
                />
              )}
              {extras.includes("show_empty_groups") && (
                <Toggle
                  label={t(`${K}.show_empty_groups`)}
                  checked={!!displayFilters.show_empty_groups}
                  onChange={(checked) => onDisplayFilters({ show_empty_groups: checked })}
                />
              )}
            </>
          )}
          {properties.length > 0 && (
            <>
              <div className="bg-subtle my-1 h-px" />
              <div className="px-3.5 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-tertiary uppercase">
                {t(`${K}.properties`)}
              </div>
              <div className="flex flex-wrap gap-[5px] px-3 pt-1 pb-1.5">
                {properties.map((p) => {
                  const on = !!displayProperties[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onDisplayProperties({ [p.key]: !on })}
                      className={cn(
                        "inline-flex h-6 items-center rounded-[10px] border border-strong px-[7px] text-[11.5px] whitespace-nowrap text-secondary transition-colors duration-[120ms] hover:text-primary",
                        { "border-accent-strong bg-accent-subtle text-primary": on }
                      )}
                    >
                      {t(`${K}.${p.label}`)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
