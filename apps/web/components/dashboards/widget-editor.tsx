/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { Switch } from "@makeplane/propel/components/switch";
import {
  BarOutline,
  HashOutline,
  LineOutline,
  ListLayoutOutline,
  RankOutline,
  TableOutline,
} from "@makeplane/propel/icons";
import { Select } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// components
import { Segmented } from "@/components/analytics/charts/cards";
// local imports
import { PQLEditor } from "./pql-code";
import type {
  TDashboard,
  TDashboardScope,
  TDashboardWidget,
  TWidgetChart,
  TWidgetConfig,
  TWidgetData,
  TWidgetDraft,
} from "./types";
import { dashboardsService } from "./use-dashboards";
import { WidgetBody } from "./widget-body";

const CHARTS: { chart: TWidgetChart; icon: ReactNode }[] = [
  { chart: "number", icon: <HashOutline /> },
  { chart: "line", icon: <LineOutline /> },
  { chart: "bars", icon: <BarOutline /> },
  { chart: "rows", icon: <RankOutline /> },
  { chart: "list", icon: <ListLayoutOutline /> },
  { chart: "table", icon: <TableOutline /> },
];

const ROW_FIELDS = [
  "project",
  "state_group",
  "state",
  "priority",
  "assignee",
  "assignee_type",
  "label",
  "module",
  "cycle",
  "parent",
  "created_by",
] as const;
const SPLITS = ["state_group", "priority", "assignee_type", "project", "assignee", "label"] as const;

/** What each chart starts with when it is picked */
export const CHART_DEFAULTS: Record<TWidgetChart, { config: TWidgetConfig; width: number; height: number }> = {
  number: { config: { measure: "count" }, width: 3, height: 3 },
  line: { config: { measure: "running", x_axis: "created_resolved", split_by: "" }, width: 8, height: 7 },
  bars: { config: { x_axis: "done", split_by: "assignee_type", totals: false }, width: 6, height: 7 },
  rows: { config: { x_axis: "project", split_by: "status" }, width: 6, height: 7 },
  list: { config: { sort: "oldest" }, width: 6, height: 7 },
  table: { config: { x_axis: "state_group", split_by: "status" }, width: 6, height: 7 },
};

const WIDTHS = ["4", "6", "8", "12"] as const;

type Props = {
  workspaceSlug: string;
  dashboard: TDashboard;
  scope: TDashboardScope;
  /** The widget to edit, or what a new one starts from */
  widget: TDashboardWidget | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: TWidgetDraft, widget: TDashboardWidget | null) => Promise<void>;
};

function FieldSelect(props: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const { label, value, options, onChange } = props;
  const selected = options.find((option) => option.id === value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-11 font-semibold tracking-[0.04em] text-tertiary uppercase">{label}</span>
      <Select<{ id: string; label: string }>
        getValues={() => options}
        value={selected ?? null}
        onChange={(id) => onChange(String(id ?? ""))}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.label}
        showSearch={options.length > 8}
        pinSelected={false}
      >
        <Select.Trigger
          variant="select-md"
          aria-label={label}
          className="h-8 w-full border border-strong bg-surface-2 shadow-none"
        >
          <span className="min-w-0 flex-1 truncate text-left text-primary">{selected?.label}</span>
        </Select.Trigger>
      </Select>
    </div>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-primary">
      <Switch size="sm" checked={props.checked} onCheckedChange={props.onChange} aria-label={props.label} />
      {props.label}
    </label>
  );
}

/** The widget editor (r5-22): a title, the query, the chart and its settings, and a live preview */
export function WidgetEditor(props: Props) {
  const { workspaceSlug, dashboard, scope, widget, isOpen, onClose, onSave } = props;
  const { t } = useTranslation();
  const isNew = !widget?.id;

  const [title, setTitle] = useState("");
  const [pql, setPQL] = useState("");
  const [chart, setChart] = useState<TWidgetChart>("number");
  const [config, setConfig] = useState<TWidgetConfig>({});
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(7);
  const [preview, setPreview] = useState<TWidgetData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const start = widget ?? null;
    const base = CHART_DEFAULTS[start?.chart ?? "line"];
    setTitle(start?.title ?? "");
    setPQL(start?.pql ?? "");
    setChart(start?.chart ?? "line");
    setConfig({ legend: true, show_query: true, ...base.config, ...start?.config });
    setWidth(start?.width ?? base.width);
    setHeight(start?.height ?? base.height);
    setPreview(null);
  }, [isOpen, widget]);

  // the preview follows the query and the settings, a moment after the last keystroke
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      dashboardsService
        .preview(workspaceSlug, dashboard.id, { chart, pql, config }, scope)
        .then((data) => !cancelled && setPreview(data))
        .catch(() => !cancelled && setPreview(null));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, workspaceSlug, dashboard.id, chart, pql, config, scope]);

  const pickChart = (next: TWidgetChart) => {
    if (next === chart) return;
    const base = CHART_DEFAULTS[next];
    setChart(next);
    setConfig({ legend: config.legend ?? true, show_query: config.show_query ?? true, ...base.config });
    setWidth(base.width);
    setHeight(base.height);
  };
  const set = (changes: TWidgetConfig) => setConfig((current) => ({ ...current, ...changes }));

  const options = useMemo(() => {
    const field = (key: string) => ({ id: key, label: t(`dashboards.field.${key}`) });
    return {
      measureNumber: ["count", "created", "done", "resolved"].map((key) => ({
        id: key,
        label: t(`dashboards.editor.measure.${key}`),
      })),
      measureLine: [
        { id: "count", label: t("dashboards.editor.measure.per_bucket") },
        { id: "running", label: t("dashboards.editor.measure.running") },
      ],
      timeAxis: ["created", "done", "resolved"].map((key) => ({ id: key, label: t(`dashboards.editor.axis.${key}`) })),
      rows: ROW_FIELDS.map(field),
      splitTime: [{ id: "", label: t("dashboards.editor.split_none") }, ...SPLITS.map(field)],
      splitRows: [
        { id: "status", label: t("dashboards.field.status") },
        { id: "", label: t("dashboards.editor.split_none") },
        ...SPLITS.map(field),
      ],
      sort: ["oldest", "newest", "updated", "due", "priority"].map((key) => ({
        id: key,
        label: t(`dashboards.editor.sort.${key}`),
      })),
    };
  }, [t]);

  const selects: ReactNode[] = [];
  if (chart === "number") {
    selects.push(
      <FieldSelect
        key="measure"
        label={t("dashboards.editor.measure_label")}
        value={config.measure ?? "count"}
        options={options.measureNumber}
        onChange={(id) => set({ measure: id as TWidgetConfig["measure"] })}
      />
    );
  }
  if (chart === "line") {
    selects.push(
      <FieldSelect
        key="measure"
        label={t("dashboards.editor.measure_label")}
        value={config.measure ?? "running"}
        options={options.measureLine}
        onChange={(id) => set({ measure: id as TWidgetConfig["measure"] })}
      />,
      <FieldSelect
        key="x"
        label={t("dashboards.editor.x_axis")}
        value={config.x_axis ?? "created_resolved"}
        options={[{ id: "created_resolved", label: t("dashboards.editor.axis.created_resolved") }, ...options.timeAxis]}
        onChange={(id) =>
          set({ x_axis: id as TWidgetConfig["x_axis"], ...(id === "created_resolved" ? { split_by: "" } : {}) })
        }
      />
    );
    if (config.x_axis !== "created_resolved") {
      selects.push(
        <FieldSelect
          key="split"
          label={t("dashboards.editor.split_by")}
          value={config.split_by ?? ""}
          options={options.splitTime}
          onChange={(id) => set({ split_by: id as TWidgetConfig["split_by"] })}
        />
      );
    }
  }
  if (chart === "bars") {
    selects.push(
      <FieldSelect
        key="x"
        label={t("dashboards.editor.x_axis")}
        value={config.x_axis ?? "done"}
        options={options.timeAxis}
        onChange={(id) => set({ x_axis: id as TWidgetConfig["x_axis"] })}
      />,
      <FieldSelect
        key="split"
        label={t("dashboards.editor.split_by")}
        value={config.split_by ?? ""}
        options={options.splitTime}
        onChange={(id) => set({ split_by: id as TWidgetConfig["split_by"] })}
      />
    );
  }
  if (chart === "rows" || chart === "table") {
    selects.push(
      <FieldSelect
        key="x"
        label={t("dashboards.editor.rows")}
        value={config.x_axis ?? "project"}
        options={options.rows}
        onChange={(id) => set({ x_axis: id as TWidgetConfig["x_axis"] })}
      />,
      <FieldSelect
        key="split"
        label={t("dashboards.editor.split_by")}
        value={config.split_by ?? "status"}
        options={options.splitRows}
        onChange={(id) => set({ split_by: id as TWidgetConfig["split_by"] })}
      />
    );
  }
  if (chart === "list") {
    selects.push(
      <FieldSelect
        key="sort"
        label={t("dashboards.editor.sort_label")}
        value={config.sort ?? "oldest"}
        options={options.sort}
        onChange={(id) => set({ sort: id as TWidgetConfig["sort"] })}
      />
    );
  }

  const position = isNew
    ? t("dashboards.editor.new_position", { name: dashboard.name })
    : t("dashboards.editor.position", {
        name: dashboard.name,
        index: dashboard.widgets.findIndex((w) => w.id === widget?.id) + 1,
        count: dashboard.widgets.length,
      });
  const splits = !!config.split_by && config.split_by !== "status";
  const trimmedTitle = title.trim();

  const save = async () => {
    if (!trimmedTitle) return;
    setSaving(true);
    try {
      await onSave({ title: trimmedTitle, chart, pql: pql.trim(), config, width, height }, widget?.id ? widget : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl" height="fixed">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex flex-col gap-0.5 px-[18px] pt-4 pb-3">
            <DialogTitle>{isNew ? t("dashboards.editor.add_title") : t("dashboards.editor.edit_title")}</DialogTitle>
            <DialogDescription>{position}</DialogDescription>
          </div>
          <div className="flex min-h-0 flex-1 border-t border-subtle">
            <div className="flex w-[440px] max-w-[45%] shrink-0 flex-col gap-3.5 overflow-auto border-r border-subtle px-[18px] py-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-11 font-semibold tracking-[0.04em] text-tertiary uppercase">
                  {t("dashboards.editor.title_label")}
                </span>
                <input
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={isNew}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("dashboards.editor.title_placeholder")}
                  className="h-8 rounded-lg border border-strong bg-surface-2 px-2.5 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-11 font-semibold tracking-[0.04em] text-tertiary uppercase">
                  {t("dashboards.editor.data")}
                </span>
                <PQLEditor
                  value={pql}
                  onChange={setPQL}
                  label={t("dashboards.editor.query_label")}
                  placeholder={t("dashboards.editor.query_placeholder")}
                  matched={preview && !preview.error ? preview.matched : undefined}
                  ms={preview && !preview.error ? preview.ms : undefined}
                  error={preview?.error && preview.error.source !== "dashboard" ? preview.error : null}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-11 font-semibold tracking-[0.04em] text-tertiary uppercase">
                  {t("dashboards.editor.chart")}
                </span>
                <div role="group" aria-label={t("dashboards.editor.chart")} className="grid grid-cols-3 gap-2">
                  {CHARTS.map((option) => (
                    <button
                      key={option.chart}
                      type="button"
                      aria-pressed={chart === option.chart}
                      onClick={() => pickChart(option.chart)}
                      className={cn(
                        "flex h-16 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-strong bg-surface-2 text-12 text-secondary outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong [&_svg]:size-[18px]",
                        chart === option.chart &&
                          "border-accent-strong bg-surface-1 text-primary shadow-[0_0_0_3px_var(--bg-accent-subtle)]"
                      )}
                    >
                      {option.icon}
                      {t(`dashboards.chart.${option.chart}`)}
                    </button>
                  ))}
                </div>
              </div>
              {selects.length > 0 && <div className="grid grid-cols-2 gap-2.5">{selects}</div>}
              <div className="flex flex-col gap-2">
                {chart !== "list" && chart !== "number" && chart !== "table" && (
                  <Toggle
                    label={t("dashboards.editor.legend")}
                    checked={config.legend !== false}
                    onChange={(legend) => set({ legend })}
                  />
                )}
                {chart === "bars" && (
                  <Toggle
                    label={t("dashboards.editor.totals")}
                    checked={!!config.totals}
                    onChange={(totals) => set({ totals })}
                  />
                )}
                <Toggle
                  label={t("dashboards.editor.show_query")}
                  checked={config.show_query !== false}
                  onChange={(show_query) => set({ show_query })}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 bg-surface-2 px-[18px] py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-11 font-semibold tracking-[0.04em] text-tertiary uppercase">
                  {t("dashboards.editor.preview")}
                </span>
                <span className="text-12 text-tertiary">{t("dashboards.editor.live")}</span>
                <span className="flex-1" />
                <span className="text-12 text-secondary">{t("dashboards.editor.width")}</span>
                <Segmented
                  label={t("dashboards.editor.width")}
                  options={WIDTHS.map((w): { value: string; label: string } => ({ value: w, label: w }))}
                  value={String(width)}
                  onChange={(w) => setWidth(Number(w))}
                />
              </div>
              <section
                aria-label={t("dashboards.editor.preview")}
                className="flex min-w-0 flex-col rounded-xl border border-strong bg-surface-1"
                style={{ height: Math.min(440, height * 40 + (height - 1) * 12) }}
              >
                <div className="flex min-h-[34px] items-center gap-2 px-3.5 pt-[11px] pb-0.5">
                  <span className="truncate text-13 font-semibold text-primary">
                    {trimmedTitle || t("dashboards.editor.title_placeholder")}
                  </span>
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-hidden px-3.5 pt-2 pb-3">
                  {preview ? (
                    <WidgetBody workspaceSlug={workspaceSlug} widget={{ chart, config }} data={preview} />
                  ) : (
                    <div className="flex-1 animate-pulse rounded-lg bg-layer-2" />
                  )}
                </div>
              </section>
              {splits && <p className="text-12 text-tertiary">{t("dashboards.editor.three_series")}</p>}
            </div>
          </div>
          <DialogActions>
            {dashboard.access === "workspace" && (
              <span className="mr-auto text-12 text-tertiary">
                {t("dashboards.editor.reaches_everyone", { name: dashboard.name })}
              </span>
            )}
            <Button variant="secondary" size="md" stretch="auto" onClick={onClose} label={t("cancel")} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              disabled={!trimmedTitle}
              loading={saving}
              label={t("dashboards.editor.save")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
