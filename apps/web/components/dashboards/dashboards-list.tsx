/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import {
  AddOutline,
  AgentOutline,
  ChevronRightOutline,
  CyclesOutline,
  DashboardsOutline,
  GlobeOutline,
  HelpOutline,
  LayerStackOutline,
  LockOutline,
  SearchOutline,
  ShowOutline,
  TrendUpOutline,
} from "@makeplane/propel/icons";
import { FavoriteStar } from "@plane/blocks/common";
import { ProjectBadge } from "@plane/blocks/project-badge";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import { calculateTimeAgoShort, cn, renderFormattedDate } from "@plane/utils";
// components
import { Segmented } from "@/components/analytics/charts/cards";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user";
// local imports
import { HeadButton } from "./parts";
import { TEMPLATE_KEYS, buildTemplate } from "./templates";
import type { TTemplateKey } from "./templates";
import type { TDashboardSummary } from "./types";
import { dashboardsService, useDashboards } from "./use-dashboards";

type TShow = "all" | "favourites" | "mine" | "shared";

const TEMPLATE_ICONS: Record<TTemplateKey, typeof AddOutline> = {
  cycle_health: CyclesOutline,
  bot_activity: AgentOutline,
  throughput: TrendUpOutline,
  blank: AddOutline,
};

const COLUMNS = "24px minmax(260px,1fr) 90px 130px 160px 110px 28px";
// a project's list adds the projects each one counts
const LENS_COLUMNS = "24px minmax(220px,1fr) 170px 90px 110px 150px 90px 28px";

const CHIP =
  "inline-flex h-[22px] min-w-0 items-center gap-[5px] rounded-full border border-strong px-2 text-12 text-primary";

type Props = { workspaceSlug: string; projectId?: string };

/**
 * Dashboards (r5-20): templates to start from, then every dashboard you can open. With a project (the lens, r16-2b),
 * the workspace dashboards that count it, opened for it alone, and new ones start with it as their project.
 */
export const DashboardsListRoot = observer(function DashboardsListRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sidebarCollapsed } = useAppTheme();
  const { currentWorkspace } = useWorkspace();
  const { getProjectById } = useProject();
  const { data: currentUser } = useUser();
  const { data: dashboards, mutate } = useDashboards(workspaceSlug, projectId);
  const [show, setShow] = useState<TShow>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<TTemplateKey | null>(null);
  const projectName = getProjectById(projectId)?.name ?? "";
  const base = projectId ? `/${workspaceSlug}/projects/${projectId}/dashboards` : `/${workspaceSlug}/dashboards`;

  const create = async (key: TTemplateKey) => {
    if (creating) return;
    setCreating(key);
    try {
      const template = buildTemplate(key, t);
      const dashboard = await dashboardsService.create(workspaceSlug, {
        ...template,
        name: key === "blank" ? t("dashboards.untitled") : template.name,
        description: key === "blank" ? "" : template.description,
        ...(projectId ? { project_ids: [projectId] } : {}),
      });
      void mutate();
      void navigate(`${base}/${dashboard.id}/${key === "blank" ? "?edit=1" : ""}`);
    } catch {
      setToast({ type: "error", title: t("dashboards.errors.create") });
    } finally {
      setCreating(null);
    }
  };

  // C makes a new dashboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingInInput(e.target) || document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
      e.preventDefault();
      void create("blank");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const query = search.trim().toLowerCase();
  const rows = (dashboards ?? []).filter((d) => {
    if (show === "favourites" && !d.is_favorite) return false;
    if (show === "mine" && d.owner_id !== currentUser?.id) return false;
    // shared: the workspace's dashboards that someone else owns
    if (show === "shared" && (d.access !== "workspace" || d.owner_id === currentUser?.id)) return false;
    return !query || d.name.toLowerCase().includes(query) || d.description.toLowerCase().includes(query);
  });

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 px-[18px] pt-3 pb-2.5">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {sidebarCollapsed && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            <span className="truncate">{projectId ? projectName : currentWorkspace?.name}</span>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-primary">{t("dashboards.title")}</span>
          </nav>
          <span className="flex-1" />
          <HeadButton primary icon={<AddOutline />} kbd="C" disabled={!!creating} onClick={() => void create("blank")}>
            {projectId ? t("dashboards.lens.new", { project: projectName }) : t("dashboards.new")}
          </HeadButton>
        </div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">
            {t("dashboards.title")}
          </h1>
          {dashboards && (
            <span className="rounded-[5px] bg-layer-2 px-[7px] text-12 leading-5 text-secondary tabular-nums">
              {dashboards.length}
            </span>
          )}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-y border-strong px-[18px] py-2">
        <Segmented
          label={t("dashboards.show_label")}
          options={(["all", "favourites", "mine", "shared"] as const).map((value) => ({
            value,
            label: t(`dashboards.show.${value}`),
          }))}
          value={show}
          onChange={setShow}
        />
        <label className="flex h-[30px] w-[240px] items-center gap-2 rounded-lg border border-strong bg-surface-2 px-2.5 focus-within:border-accent-strong">
          <SearchOutline className="size-[13px] text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("dashboards.search")}
            placeholder={t("dashboards.search")}
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
          />
        </label>
        {projectId && (
          <span className="ml-1 flex min-w-0 items-center gap-1.5 text-12 text-tertiary">
            <ShowOutline className="size-[13px] shrink-0" aria-hidden="true" />
            {t("dashboards.lens.note", { project: projectName })}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <section className="px-[18px] pt-3.5 pb-1.5" aria-labelledby="dashboard-templates">
          <h2 id="dashboard-templates" className="mb-2 text-11 font-semibold tracking-[0.04em] text-tertiary uppercase">
            {projectId
              ? t("dashboards.lens.templates_heading", { project: projectName })
              : t("dashboards.templates.heading")}
          </h2>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {TEMPLATE_KEYS.map((key) => {
              const Icon = TEMPLATE_ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!!creating}
                  onClick={() => void create(key)}
                  className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-strong bg-surface-1 px-3 py-2.5 text-left outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong disabled:opacity-60"
                >
                  <Icon className="size-4 shrink-0 text-accent-primary" />
                  <span className="flex min-w-0 flex-col leading-[1.3]">
                    <span className="truncate text-13 font-medium text-primary">
                      {t(`dashboards.templates.${key}.name`)}
                    </span>
                    <span className="truncate text-[11.5px] text-tertiary">
                      {t(`dashboards.templates.${key}.hint`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-2.5 min-w-[900px]" role="table" aria-label={t("dashboards.title")}>
          <div
            role="row"
            className="grid h-[30px] items-center gap-x-3 border-y border-strong px-[18px] text-[11.5px] font-medium text-secondary"
            style={{ gridTemplateColumns: projectId ? LENS_COLUMNS : COLUMNS }}
          >
            <span role="columnheader" />
            <span role="columnheader">{t("dashboards.columns.name")}</span>
            {projectId && <span role="columnheader">{t("dashboards.columns.counts")}</span>}
            <span role="columnheader">{t("dashboards.columns.widgets")}</span>
            <span role="columnheader">{t("dashboards.columns.access")}</span>
            <span role="columnheader">{t("dashboards.columns.owner")}</span>
            <span role="columnheader">{t("dashboards.columns.updated")}</span>
            <span role="columnheader" />
          </div>
          {!dashboards &&
            [0, 1, 2].map((i) => <div key={i} className="mx-[18px] my-2 h-8 animate-pulse rounded-md bg-layer-2" />)}
          {dashboards && !rows.length && (
            <p className="px-[18px] py-6 text-13 text-tertiary">
              {dashboards.length
                ? t("dashboards.none_match")
                : projectId
                  ? t("dashboards.lens.none_yet", { project: projectName })
                  : t("dashboards.none_yet")}
            </p>
          )}
          {rows.map((dashboard) => (
            <DashboardRow
              key={dashboard.id}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              dashboard={dashboard}
              onFavourite={(next) => {
                void mutate((list) => list?.map((d) => (d.id === dashboard.id ? { ...d, is_favorite: next } : d)), {
                  revalidate: false,
                });
                void dashboardsService.setFavorite(workspaceSlug, dashboard.id, next).catch(() => mutate());
              }}
            />
          ))}
        </div>
        {projectId && !!dashboards?.length && (
          <p className="flex items-center gap-1.5 px-[18px] py-3.5 text-12 text-tertiary">
            <HelpOutline className="size-[13px] shrink-0" aria-hidden="true" />
            {t("dashboards.lens.footer", { count: dashboards.length, project: projectName })}
          </p>
        )}
      </div>
    </div>
  );
});

/** The projects a dashboard counts, the lens's own first, or every project when it names none */
const CountsCell = observer(function CountsCell(props: { projectIds: string[]; projectId: string }) {
  const { projectIds, projectId } = props;
  const { t } = useTranslation();
  const { getProjectById } = useProject();

  if (!projectIds.length)
    return (
      <span role="cell" className="flex min-w-0">
        <span className={CHIP}>
          <LayerStackOutline className="size-3 shrink-0 text-secondary" />
          {t("dashboards.every_project")}
        </span>
      </span>
    );

  const ordered = projectIds.includes(projectId)
    ? [projectId, ...projectIds.filter((id) => id !== projectId)]
    : projectIds;
  const projects = ordered.map((id) => getProjectById(id)).filter((project) => project !== undefined);
  const shown = projects.slice(0, 2);
  const more = projectIds.length - shown.length;

  return (
    <span role="cell" className="flex min-w-0 gap-1" title={projects.map((project) => project.name).join(", ")}>
      {shown.map((project) => (
        <span key={project.id} className={CHIP}>
          <ProjectBadge name={project.name} seed={project.id} logo={project.logo_props} size={13} />
          <span className="truncate">{project.name}</span>
        </span>
      ))}
      {more > 0 && <span className={cn(CHIP, "shrink-0 text-secondary tabular-nums")}>+{more}</span>}
    </span>
  );
});

const DashboardRow = observer(function DashboardRow(props: {
  workspaceSlug: string;
  projectId?: string;
  dashboard: TDashboardSummary;
  onFavourite: (next: boolean) => void;
}) {
  const { workspaceSlug, projectId, dashboard, onFavourite } = props;
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const owner = getUserDetails(dashboard.owner_id);
  const updatedDays = (Date.now() - new Date(dashboard.updated_at).getTime()) / 86_400_000;
  const updated =
    updatedDays < 2
      ? t("dashboards.ago", { time: calculateTimeAgoShort(dashboard.updated_at) })
      : (renderFormattedDate(dashboard.updated_at, "MMM d") ?? "");
  const AccessIcon = dashboard.access === "workspace" ? GlobeOutline : LockOutline;

  return (
    <div
      role="row"
      className="group relative grid h-12 items-center gap-x-3 border-b border-subtle px-[18px] hover:bg-layer-1-hover"
      style={{ gridTemplateColumns: projectId ? LENS_COLUMNS : COLUMNS }}
    >
      <DashboardsOutline className="size-4 text-accent-primary" aria-hidden="true" />
      <Link
        to={
          projectId
            ? `/${workspaceSlug}/projects/${projectId}/dashboards/${dashboard.id}/`
            : `/${workspaceSlug}/dashboards/${dashboard.id}/`
        }
        role="cell"
        className="flex min-w-0 flex-col leading-[1.3] text-primary after:absolute after:inset-0 after:content-['']"
      >
        <span className="truncate font-medium">{dashboard.name}</span>
        {dashboard.description && <span className="truncate text-12 text-tertiary">{dashboard.description}</span>}
      </Link>
      {projectId && <CountsCell projectIds={dashboard.project_ids} projectId={projectId} />}
      <span role="cell" className="text-[12.5px] text-secondary tabular-nums">
        {t("dashboards.widgets_count", { count: dashboard.widget_count })}
      </span>
      <span role="cell">
        <span className="inline-flex h-[22px] items-center gap-[5px] rounded-full border border-strong px-2 text-12 text-primary">
          <AccessIcon className="size-3 text-secondary" />
          {t(`dashboards.access.${dashboard.access}`)}
        </span>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-primary">
        <ButtonAvatars showTooltip={false} userIds={dashboard.owner_id} />
        <span className="truncate">{owner?.display_name}</span>
      </span>
      <span role="cell" className="text-12 text-secondary">
        {updated}
      </span>
      <span role="cell" className={cn("relative z-[1] flex justify-end")}>
        <FavoriteStar
          selected={dashboard.is_favorite}
          aria-label={dashboard.is_favorite ? t("dashboards.unfavourite") : t("dashboards.favourite")}
          buttonClassName="size-6 rounded-md hover:bg-layer-1"
          iconClassName="size-3.5"
          onClick={() => onFavourite(!dashboard.is_favorite)}
        />
      </span>
    </div>
  );
});
