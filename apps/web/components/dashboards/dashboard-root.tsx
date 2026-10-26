/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  MenuCheckboxItem,
} from "@makeplane/propel/components/menu";
import { Popover, PopoverBody, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import {
  AddOutline,
  ChevronDownOutline,
  ChevronRightOutline,
  CopyOutline,
  DeleteOutline,
  EditOutline,
  FilterOutline,
  GlobeOutline,
  LinkOutline,
  LockOutline,
  MoreHorizontalOutline,
  UndoOutline,
} from "@makeplane/propel/icons";
import { FavoriteStar } from "@plane/blocks/common";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { ProjectBadge } from "@plane/blocks/project-badge";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import { cn, copyTextToClipboard } from "@plane/utils";
// components
import { Segmented } from "@/components/analytics/charts/cards";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user";
// local imports
import { DashboardGrid } from "./grid";
import { HeadButton, Kbd } from "./parts";
import { PQLCode } from "./pql-code";
import type { TDashboard, TDashboardPeriod, TDashboardWidget, TWidgetDraft } from "./types";
import {
  PERIODS,
  dashboardsService,
  refreshDashboards,
  useDashboard,
  useDashboardData,
  useDashboardScope,
} from "./use-dashboards";
import { WidgetEditor } from "./widget-editor";

type TUndo =
  | { type: "layout"; widgets: TDashboardWidget[] }
  | { type: "add"; id: string }
  | { type: "delete"; widget: TDashboardWidget }
  | { type: "update"; widget: TDashboardWidget };

const layoutOf = (widgets: TDashboardWidget[]) =>
  widgets.map(({ id, sort_order, width, height }) => ({ id, sort_order, width, height }));

const draftOf = (widget: TDashboardWidget): TWidgetDraft => ({
  title: widget.title,
  chart: widget.chart,
  pql: widget.pql,
  config: widget.config,
  width: widget.width,
  height: widget.height,
  sort_order: widget.sort_order,
});

const byOrder = (widgets: TDashboardWidget[]) =>
  // a copy, sorted: the lib here predates toSorted
  // oxlint-disable-next-line unicorn/no-array-sort
  [...widgets].sort((a, b) => a.sort_order - b.sort_order);

const anOverlayIsOpen = () => !!document.querySelector("[role=dialog], [role=alertdialog], [role=menu]");

type Props = { workspaceSlug: string; dashboardId: string };

/** A dashboard (r5-21): the head, the period, projects and query, and its widgets; E edits them in place */
export const DashboardRoot = observer(function DashboardRoot(props: Props) {
  const { workspaceSlug, dashboardId } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { currentWorkspace } = useWorkspace();
  const { joinedProjectIds, getProjectById } = useProject();
  const { getUserDetails } = useMember();
  const { data: currentUser } = useUser();
  // data
  const { data: dashboard, error, mutate } = useDashboard(workspaceSlug, dashboardId);
  const { scope, effective, update, reset, tried } = useDashboardScope(dashboard);
  const { data } = useDashboardData(workspaceSlug, dashboard, scope);
  // states
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [editor, setEditor] = useState<{ open: boolean; widget: TDashboardWidget | null }>({
    open: false,
    widget: null,
  });
  const [deleting, setDeleting] = useState(false);
  const [filterDraft, setFilterDraft] = useState("");
  const undo = useRef<TUndo[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const canEdit = !!dashboard?.can_edit;
  const isEditing = editing && canEdit;

  // a new dashboard opens in edit mode once; the address then forgets it
  useEffect(() => {
    if (searchParams.get("edit") !== "1") return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("edit");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  const remember = (entry: TUndo) => {
    undo.current.push(entry);
    setUndoCount(undo.current.length);
  };

  const setWidgets = useCallback(
    (widgets: TDashboardWidget[]) =>
      mutate((current) => (current ? { ...current, widgets } : current), { revalidate: false }),
    [mutate]
  );

  const failed = useCallback(() => {
    setToast({ type: "error", title: t("dashboards.errors.save") });
    void mutate();
  }, [mutate, t]);

  const saveLayout = useCallback(
    async (next: TDashboardWidget[], record = true) => {
      if (!dashboard) return;
      if (record) remember({ type: "layout", widgets: dashboard.widgets });
      const sorted = byOrder(next);
      await setWidgets(sorted);
      try {
        await setWidgets(await dashboardsService.saveLayout(workspaceSlug, dashboard.id, layoutOf(sorted)));
      } catch {
        failed();
      }
    },
    [dashboard, workspaceSlug, setWidgets, failed]
  );

  const saveDashboard = async (changes: Partial<TDashboard>) => {
    if (!dashboard) return;
    try {
      await mutate(await dashboardsService.update(workspaceSlug, dashboard.id, changes), { revalidate: false });
      void refreshDashboards(workspaceSlug);
    } catch (err) {
      const pqlError = (err as { pql?: { message?: string } } | undefined)?.pql;
      setToast({
        type: "error",
        title: pqlError ? t("dashboards.errors.query") : t("dashboards.errors.save"),
        message: pqlError?.message,
      });
    }
  };

  const saveWidget = async (draft: TWidgetDraft, widget: TDashboardWidget | null) => {
    if (!dashboard) return;
    try {
      if (widget) {
        const saved = await dashboardsService.updateWidget(workspaceSlug, dashboard.id, widget.id, draft);
        remember({ type: "update", widget });
        await setWidgets(dashboard.widgets.map((w) => (w.id === saved.id ? saved : w)));
      } else {
        const saved = await dashboardsService.addWidget(workspaceSlug, dashboard.id, draft);
        remember({ type: "add", id: saved.id });
        await setWidgets(byOrder([...dashboard.widgets, saved]));
      }
      setEditor({ open: false, widget: null });
      void refreshDashboards(workspaceSlug);
    } catch (err) {
      const pqlError = (err as { pql?: { message?: string } } | undefined)?.pql;
      setToast({
        type: "error",
        title: pqlError ? t("dashboards.errors.query") : t("dashboards.errors.save"),
        message: pqlError?.message,
      });
    }
  };

  const duplicateWidget = async (widget: TDashboardWidget) => {
    if (!dashboard) return;
    const index = dashboard.widgets.findIndex((w) => w.id === widget.id);
    const after = dashboard.widgets[index + 1];
    const sortOrder = after ? (widget.sort_order + after.sort_order) / 2 : widget.sort_order + 1000;
    try {
      const saved = await dashboardsService.addWidget(workspaceSlug, dashboard.id, {
        ...draftOf(widget),
        title: t("dashboards.widget.copy_of", { title: widget.title }),
        sort_order: sortOrder,
      });
      remember({ type: "add", id: saved.id });
      await setWidgets(byOrder([...dashboard.widgets, saved]));
    } catch {
      failed();
    }
  };

  const deleteWidget = async (widget: TDashboardWidget) => {
    if (!dashboard) return;
    remember({ type: "delete", widget });
    await setWidgets(dashboard.widgets.filter((w) => w.id !== widget.id));
    try {
      await dashboardsService.removeWidget(workspaceSlug, dashboard.id, widget.id);
      setToast({ type: "success", title: t("dashboards.widget.deleted", { title: widget.title }) });
      void refreshDashboards(workspaceSlug);
    } catch {
      failed();
    }
  };

  const undoLast = useCallback(async () => {
    const entry = undo.current.pop();
    setUndoCount(undo.current.length);
    if (!entry || !dashboard) return;
    try {
      if (entry.type === "layout") await saveLayout(entry.widgets, false);
      if (entry.type === "add") {
        await setWidgets(dashboard.widgets.filter((w) => w.id !== entry.id));
        await dashboardsService.removeWidget(workspaceSlug, dashboard.id, entry.id);
      }
      if (entry.type === "delete") {
        const restored = await dashboardsService.addWidget(workspaceSlug, dashboard.id, draftOf(entry.widget));
        await setWidgets(byOrder([...dashboard.widgets, restored]));
      }
      if (entry.type === "update") {
        const restored = await dashboardsService.updateWidget(
          workspaceSlug,
          dashboard.id,
          entry.widget.id,
          draftOf(entry.widget)
        );
        await setWidgets(dashboard.widgets.map((w) => (w.id === restored.id ? restored : w)));
      }
    } catch {
      failed();
    }
  }, [dashboard, workspaceSlug, saveLayout, setWidgets, failed]);

  const openEditor = useCallback((widget: TDashboardWidget | null) => setEditor({ open: true, widget }), []);

  // E edits, Escape is done, A adds a widget, ⌘Z takes the last change back
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingInInput(e.target) || anOverlayIsOpen()) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "z" && isEditing) {
        e.preventDefault();
        void undoLast();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (key === "e" && canEdit && !isEditing) {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === "Escape" && isEditing) {
        e.preventDefault();
        setEditing(false);
      } else if (key === "a" && isEditing) {
        e.preventDefault();
        openEditor(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canEdit, isEditing, undoLast, openEditor]);

  if (error && !dashboard) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-14 font-medium text-primary">{t("dashboards.not_found")}</p>
        <Link to={`/${workspaceSlug}/dashboards/`} className="text-13 text-accent-primary hover:underline">
          {t("dashboards.back_to_list")}
        </Link>
      </div>
    );
  }

  // edits to the period, projects and query are the dashboard's while editing, the address's otherwise
  const setScope = (changes: { period?: TDashboardPeriod; project_ids?: string[]; pql?: string }) => {
    if (isEditing) {
      reset();
      void saveDashboard(changes);
    } else update(changes);
  };

  const projectIds = effective.project_ids;
  const toggleProject = (id: string, checked: boolean) =>
    setScope({ project_ids: checked ? [...projectIds, id] : projectIds.filter((p) => p !== id) });
  const owner = dashboard ? getUserDetails(dashboard.owner_id) : undefined;
  // only the owner says who sees a dashboard
  const isOwner = !!dashboard && dashboard.owner_id === currentUser?.id;
  const per = t(data?.period.bucket === "day" ? "dashboards.per_day" : "dashboards.per_week");

  const copyLink = () =>
    void copyTextToClipboard(window.location.href).then(() =>
      setToast({ type: "success", title: t("dashboards.share.copied") })
    );

  const crumbClass = "truncate text-secondary hover:text-primary";

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-strong px-[18px] py-3">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {sidebarCollapsed && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            <span className="truncate">{currentWorkspace?.name}</span>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <Link to={`/${workspaceSlug}/dashboards/`} className={crumbClass}>
              {t("dashboards.title")}
            </Link>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            {isEditing && dashboard ? (
              <input
                key={dashboard.name}
                defaultValue={dashboard.name}
                aria-label={t("dashboards.name_label")}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== dashboard.name) void saveDashboard({ name });
                  else e.target.value = dashboard.name;
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-6 min-w-[160px] rounded-md border border-strong bg-surface-2 px-1.5 text-[12.5px] font-medium text-primary outline-none focus:border-accent-strong"
              />
            ) : (
              <span className="truncate font-medium text-primary">{dashboard?.name}</span>
            )}
          </nav>
          {dashboard && (
            <FavoriteStar
              selected={dashboard.is_favorite}
              aria-label={dashboard.is_favorite ? t("dashboards.unfavourite") : t("dashboards.favourite")}
              buttonClassName="size-6 rounded-md hover:bg-layer-1-hover"
              iconClassName="size-3.5"
              onClick={() => {
                const next = !dashboard.is_favorite;
                void mutate({ ...dashboard, is_favorite: next }, { revalidate: false });
                void dashboardsService
                  .setFavorite(workspaceSlug, dashboard.id, next)
                  .then(() => refreshDashboards(workspaceSlug))
                  .catch(failed);
              }}
            />
          )}
          <span className="flex-1" />
          {isEditing ? (
            <>
              <span className="hidden text-12 text-secondary md:inline">{t("dashboards.edit_hint")}</span>
              <HeadButton icon={<UndoOutline />} kbd="⌘Z" disabled={!undoCount} onClick={() => void undoLast()}>
                {t("dashboards.undo")}
              </HeadButton>
              <HeadButton primary kbd="Esc" onClick={() => setEditing(false)}>
                {t("dashboards.done_editing")}
              </HeadButton>
            </>
          ) : (
            dashboard && (
              <>
                <Menu>
                  <MenuTrigger
                    render={<HeadButton icon={<LinkOutline />}>{t("dashboards.share.button")}</HeadButton>}
                  />
                  <MenuContent side="bottom" align="end">
                    {isOwner && (
                      <MenuGroup>
                        <MenuLabel>{t("dashboards.share.who")}</MenuLabel>
                        <MenuItem
                          icon={<LockOutline />}
                          label={t("dashboards.access.private")}
                          description={t("dashboards.share.private_hint")}
                          selected={dashboard.access === "private"}
                          onClick={() => void saveDashboard({ access: "private" })}
                        />
                        <MenuItem
                          icon={<GlobeOutline />}
                          label={t("dashboards.access.workspace")}
                          description={t("dashboards.share.workspace_hint")}
                          selected={dashboard.access === "workspace"}
                          onClick={() => void saveDashboard({ access: "workspace" })}
                        />
                      </MenuGroup>
                    )}
                    {isOwner && <MenuSeparator />}
                    <MenuItem icon={<LinkOutline />} label={t("dashboards.share.copy_link")} onClick={copyLink} />
                  </MenuContent>
                </Menu>
                {canEdit && (
                  <HeadButton icon={<EditOutline />} kbd="E" onClick={() => setEditing(true)}>
                    {t("dashboards.edit")}
                  </HeadButton>
                )}
                <Menu>
                  <MenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={t("dashboards.more")}
                        className="flex size-7 items-center justify-center rounded-lg text-secondary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong"
                      >
                        <MoreHorizontalOutline className="size-4" />
                      </button>
                    }
                  />
                  <MenuContent side="bottom" align="end">
                    <MenuItem
                      icon={<CopyOutline />}
                      label={t("dashboards.duplicate")}
                      onClick={() =>
                        void dashboardsService
                          .duplicate(workspaceSlug, dashboard.id, t("dashboards.copy_name", { name: dashboard.name }))
                          .then((copy) => {
                            void refreshDashboards(workspaceSlug);
                            return navigate(`/${workspaceSlug}/dashboards/${copy.id}/`);
                          })
                          .catch(failed)
                      }
                    />
                    {canEdit && (
                      <MenuItem
                        variant="danger"
                        icon={<DeleteOutline />}
                        label={t("dashboards.delete")}
                        onClick={() => setDeleting(true)}
                      />
                    )}
                  </MenuContent>
                </Menu>
              </>
            )
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("dashboards.period_label")}
            options={PERIODS.map((p) => ({ value: p, label: t(`dashboards.period.${p}`) }))}
            value={effective.period}
            onChange={(period) => setScope({ period })}
          />
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  className="flex h-[26px] items-center gap-1.5 rounded-full border border-strong bg-layer-1 px-2.5 text-12 text-primary hover:bg-layer-1-hover"
                >
                  {projectIds.slice(0, 3).map((id) => {
                    const project = getProjectById(id);
                    return project ? (
                      <ProjectBadge
                        key={id}
                        name={project.name}
                        seed={project.id}
                        logo={project.logo_props}
                        size={14}
                      />
                    ) : null;
                  })}
                  {projectIds.length === 1
                    ? (getProjectById(projectIds[0])?.name ?? t("dashboards.projects.some", { count: 1 }))
                    : projectIds.length
                      ? t("dashboards.projects.some", { count: projectIds.length })
                      : t("dashboards.projects.all")}
                  <ChevronDownOutline className="size-3 text-secondary" />
                </button>
              }
            />
            <MenuContent side="bottom" align="start">
              <MenuItem
                label={t("dashboards.projects.all")}
                selected={!projectIds.length}
                onClick={() => setScope({ project_ids: [] })}
              />
              <MenuGroup>
                {(joinedProjectIds ?? []).map((id) => {
                  const project = getProjectById(id);
                  if (!project) return null;
                  return (
                    <MenuCheckboxItem
                      key={id}
                      label={project.name}
                      icon={<ProjectBadge name={project.name} seed={project.id} logo={project.logo_props} />}
                      checked={projectIds.includes(id)}
                      onCheckedChange={(checked) => toggleProject(id, checked)}
                    />
                  );
                })}
              </MenuGroup>
            </MenuContent>
          </Menu>
          <Popover onOpenChange={(open) => open && setFilterDraft(effective.pql)}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "flex h-[26px] max-w-[420px] min-w-0 items-center gap-1.5 rounded-full border border-strong px-2.5 text-12 hover:bg-layer-1-hover",
                    effective.pql ? "bg-layer-1 text-primary" : "border-dashed text-secondary"
                  )}
                >
                  {effective.pql ? (
                    <>
                      <FilterOutline className="size-3 shrink-0 text-secondary" />
                      <PQLCode text={effective.pql} className="truncate" />
                    </>
                  ) : (
                    <>
                      <AddOutline className="size-3" />
                      {t("dashboards.filter.add")}
                    </>
                  )}
                </button>
              }
            />
            <PopoverContent side="bottom" align="start" sideOffset={6}>
              <PopoverBody>
                <form
                  className="flex w-[380px] flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setScope({ pql: filterDraft.trim() });
                  }}
                >
                  <span className="text-12 text-secondary">{t("dashboards.filter.hint")}</span>
                  <input
                    // oxlint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    value={filterDraft}
                    onChange={(e) => setFilterDraft(e.target.value)}
                    spellCheck={false}
                    aria-label={t("dashboards.filter.label")}
                    placeholder={t("dashboards.filter.placeholder")}
                    className="h-[30px] rounded-lg border border-strong bg-surface-2 px-2.5 font-code text-[12.5px] text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
                  />
                  <div className="flex justify-end gap-2">
                    {effective.pql && (
                      <HeadButton onClick={() => setScope({ pql: "" })}>{t("dashboards.filter.clear")}</HeadButton>
                    )}
                    <HeadButton primary type="submit">
                      {t("dashboards.filter.apply")}
                    </HeadButton>
                  </div>
                </form>
              </PopoverBody>
            </PopoverContent>
          </Popover>
          {tried && !isEditing && (
            <button type="button" onClick={reset} className="text-12 text-accent-primary hover:underline">
              {t("dashboards.back_to_saved")}
            </button>
          )}
          <span className="flex-1" />
          {dashboard && (
            <span className="text-12 text-tertiary">
              {t(dashboard.access === "workspace" ? "dashboards.meta.workspace" : "dashboards.meta.private", {
                count: dashboard.widgets.length,
                owner: owner?.display_name ?? "",
              })}
            </span>
          )}
        </div>
        {data?.error && (
          <p role="alert" className="text-12 text-danger-primary">
            {t("dashboards.errors.dashboard_query", { message: data.error.message })}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-[18px] pt-3.5 pb-6">
        {isEditing && dashboard && (
          <input
            key={`d:${dashboard.description}`}
            defaultValue={dashboard.description}
            aria-label={t("dashboards.description_label")}
            placeholder={t("dashboards.description_placeholder")}
            onBlur={(e) => {
              const description = e.target.value.trim();
              if (description !== dashboard.description) void saveDashboard({ description });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="mb-3 h-7 w-full max-w-[560px] rounded-md border border-transparent bg-transparent px-1.5 text-13 text-secondary outline-none placeholder:text-placeholder hover:border-strong focus:border-accent-strong"
          />
        )}
        {!dashboard ? (
          <div className="grid grid-cols-12 gap-3">
            {(["a", "b", "c", "d", "e", "f"] as const).map((key, i) => (
              <div
                key={key}
                className="h-32 animate-pulse rounded-xl bg-layer-2"
                style={{ gridColumn: `span ${[3, 3, 3, 3, 7, 5][i]}` }}
              />
            ))}
          </div>
        ) : dashboard.widgets.length === 0 && !isEditing ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-14 font-medium text-primary">{t("dashboards.empty.title")}</p>
            <p className="max-w-[420px] text-13 text-secondary">{t("dashboards.empty.description")}</p>
            {canEdit && (
              <HeadButton
                primary
                icon={<AddOutline />}
                className="mt-2"
                onClick={() => {
                  setEditing(true);
                  openEditor(null);
                }}
              >
                {t("dashboards.add_widget")}
              </HeadButton>
            )}
          </div>
        ) : (
          <DashboardGrid
            workspaceSlug={workspaceSlug}
            widgets={dashboard.widgets}
            data={data}
            per={per}
            canEdit={canEdit}
            editing={isEditing}
            onLayout={(next) => void saveLayout(next)}
            onEdit={(widget) => openEditor(widget)}
            onDuplicate={(widget) => void duplicateWidget(widget)}
            onDelete={(widget) => void deleteWidget(widget)}
          />
        )}
        {isEditing && (
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-strong text-13 text-secondary outline-none hover:bg-layer-1-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong"
          >
            <AddOutline className="size-4" />
            {t("dashboards.add_widget")}
            <Kbd>A</Kbd>
          </button>
        )}
      </div>

      {dashboard && (
        <WidgetEditor
          workspaceSlug={workspaceSlug}
          dashboard={dashboard}
          scope={scope}
          widget={editor.widget ?? null}
          isOpen={editor.open}
          onClose={() => setEditor({ open: false, widget: null })}
          onSave={saveWidget}
        />
      )}
      {dashboard && (
        <ConfirmDialog
          isOpen={deleting}
          isSubmitting={false}
          title={t("dashboards.delete_confirm.title")}
          content={t("dashboards.delete_confirm.content", { name: dashboard.name })}
          handleClose={() => setDeleting(false)}
          handleSubmit={async () => {
            try {
              await dashboardsService.remove(workspaceSlug, dashboard.id);
              void refreshDashboards(workspaceSlug);
              void navigate(`/${workspaceSlug}/dashboards/`);
            } catch {
              failed();
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}
    </div>
  );
});
