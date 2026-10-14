/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@makeplane/propel/components/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@makeplane/propel/components/menu";
import {
  ChevronDownOutline,
  ChevronRightOutline,
  LayerStackOutline,
  PreferencesOutline,
} from "@makeplane/propel/icons";
// plane imports
import { ProjectBadge } from "@plane/blocks/project-badge";
import { useTranslation } from "@plane/i18n";
import type { TEpic, TWorkspaceEpicStatus } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useEpic } from "@/hooks/store/use-epic";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import useLocalStorage from "@/hooks/use-local-storage";
// local imports
import {
  EpicHealthCell,
  EpicLead,
  EpicProgressCell,
  EpicStateIcon,
  EpicWorkingLine,
  Segmented,
  ToolbarChip,
  shortDate,
} from "./parts";
import { sortEpics } from "./project-epics";

const ROWS_PER_PROJECT = 5;
type TColumn = "health" | "lead" | "target";
const OPTIONAL_COLUMNS: TColumn[] = ["health", "lead", "target"];
const COLUMN_WIDTH: Record<TColumn, string> = { health: "100px", lead: "140px", target: "70px" };

type Props = { workspaceSlug: string };

/** Epics across the projects you are in (r4-11): the counts, then the open epics grouped by project. */
export const WorkspaceEpicsRoot = observer(function WorkspaceEpicsRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const router = useRouter();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { currentWorkspace } = useWorkspace();
  const { joinedProjectIds, getProjectById } = useProject();
  const { fetchWorkspaceEpics, workspaceEpicIds, workspaceStats, getEpicById } = useEpic();
  // states
  const [status, setStatus] = useState<TWorkspaceEpicStatus>("open");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { storedValue: grouped, setValue: setGrouped } = useLocalStorage<boolean>("epics_ws_grouped", true);
  const { storedValue: hidden, setValue: setHidden } = useLocalStorage<TColumn[]>("epics_ws_hidden_columns", []);
  const columns = OPTIONAL_COLUMNS.filter((column) => !(hidden ?? []).includes(column));
  const template = `30px 80px minmax(220px,1fr) 210px ${columns.map((column) => COLUMN_WIDTH[column]).join(" ")}`;

  useEffect(() => {
    setIsLoading(true);
    void fetchWorkspaceEpics(workspaceSlug, status, projectIds).finally(() => setIsLoading(false));
  }, [workspaceSlug, status, projectIds, fetchWorkspaceEpics]);

  // read on every render, so a row changed elsewhere (its lead, an update) shows here at once
  const epics = (workspaceEpicIds ?? []).map((id) => getEpicById(id)).filter((epic): epic is TEpic => !!epic);

  const groupEpics = () => {
    const sorted = sortEpics(epics, "target");
    if (grouped === false) return [{ projectId: "all", epics: sorted }];
    const byProject = new Map<string, TEpic[]>();
    for (const epic of sorted) byProject.set(epic.project_id, [...(byProject.get(epic.project_id) ?? []), epic]);
    return (
      [...byProject.entries()]
        .map(([projectId, list]) => ({ projectId, epics: list }))
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort((a, b) =>
          (getProjectById(a.projectId)?.name ?? "").localeCompare(getProjectById(b.projectId)?.name ?? "")
        )
    );
  };
  const groups = groupEpics();

  const pickedProjects = projectIds.length ? projectIds : (joinedProjectIds ?? []);
  const toggleProject = (id: string, checked: boolean) =>
    setProjectIds((current) => {
      const base = current.length ? current : [];
      return checked ? [...base, id] : base.filter((item) => item !== id);
    });

  const stats = workspaceStats;
  const statCards: { value: number; label: string; tone?: string }[] = stats
    ? [
        { value: stats.total, label: t("epics.stats.epics_in_projects", { projects: stats.projects }) },
        { value: stats.in_progress, label: t("epics.stats.in_progress") },
        { value: stats.on_track, label: t("epics.stats.on_track"), tone: "text-success-primary" },
        { value: stats.at_risk, label: t("epics.stats.at_risk"), tone: "text-warning-primary" },
        { value: stats.done_this_quarter, label: t("epics.stats.done_this_quarter") },
      ]
    : [];

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 px-[18px] pt-3 pb-2.5">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {sidebarCollapsed && <AppSidebarToggleButton />}
          <nav
            aria-label={t("aria_labels.breadcrumb.trail")}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
          >
            <span className="truncate">{currentWorkspace?.name}</span>
            <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-primary">{t("epics.title")}</span>
          </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">{t("epics.title")}</h1>
          <span className="rounded-[5px] bg-layer-2 px-[7px] text-12 leading-5 text-secondary">
            {t("epics.all_projects")}
          </span>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap gap-2.5 border-b border-strong px-[18px] pt-1 pb-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="flex min-w-[120px] flex-col gap-0.5 rounded-[10px] border border-strong bg-surface-2 px-3.5 py-2.5"
          >
            <span className={cn("text-20 leading-tight font-semibold tabular-nums", card.tone ?? "text-primary")}>
              {card.value}
            </span>
            <span className="text-12 text-secondary">{card.label}</span>
          </div>
        ))}
        {!stats && <div className="h-[62px]" aria-hidden="true" />}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-strong px-[18px] py-2">
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-lg border border-strong bg-layer-1 px-2.5 text-[12.5px] font-medium text-primary shadow-e1 hover:bg-layer-1-hover"
              >
                <span className="flex items-center gap-0.5">
                  {pickedProjects.slice(0, 3).map((id) => {
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
                </span>
                {projectIds.length ? t("epics.projects.some", { count: projectIds.length }) : t("epics.projects.all")}
                <ChevronDownOutline className="size-3 text-secondary" />
              </button>
            }
          />
          <MenuContent side="bottom" align="start">
            <MenuItem label={t("epics.projects.all")} selected={!projectIds.length} onClick={() => setProjectIds([])} />
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
        <Segmented
          label={t("epics.columns.epic")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: t("epics.open") },
            { value: "all", label: t("epics.all") },
            { value: "done", label: t("epics.done") },
          ]}
        />
        <Menu>
          <MenuTrigger
            render={
              <button type="button" className="rounded-[10px] outline-none focus-visible:ring-2">
                <ToolbarChip icon={<LayerStackOutline />}>
                  {t("epics.group.label", {
                    value: grouped === false ? t("epics.group.none") : t("epics.group.project"),
                  })}
                </ToolbarChip>
              </button>
            }
          />
          <MenuContent side="bottom" align="start">
            <MenuItem label={t("epics.group.project")} selected={grouped !== false} onClick={() => setGrouped(true)} />
            <MenuItem label={t("epics.group.none")} selected={grouped === false} onClick={() => setGrouped(false)} />
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
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[1040px]">
          <div
            role="row"
            className="sticky top-0 z-[5] grid h-[30px] items-center gap-x-3 border-b border-strong bg-surface-1 px-[18px] text-[11.5px] font-medium text-secondary"
            style={{ gridTemplateColumns: template }}
          >
            <span />
            <span>{t("epics.columns.id")}</span>
            <span>{t("epics.columns.epic")}</span>
            <span>{t("epics.columns.progress")}</span>
            {columns.map((column) => (
              <span key={column}>{t(`epics.columns.${column}`)}</span>
            ))}
          </div>
          {!isLoading && epics.length === 0 && (
            <p className="px-[18px] py-6 text-13 text-secondary">
              {status === "done" ? t("epics.empty.workspace_done") : t("epics.empty.workspace_open")}
            </p>
          )}
          {groups.map((section) => {
            const project = getProjectById(section.projectId);
            const isExpanded = !!expanded[section.projectId];
            const isCollapsed = !!collapsed[section.projectId];
            const rows = grouped === false || isExpanded ? section.epics : section.epics.slice(0, ROWS_PER_PROJECT);
            const more = section.epics.length - rows.length;
            return (
              <div key={section.projectId}>
                {grouped !== false && project && (
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed((state) => ({ ...state, [section.projectId]: !isCollapsed }))}
                    className="flex h-[34px] w-full items-center gap-2 border-b border-subtle bg-surface-2 px-[18px] text-left text-13"
                  >
                    <ChevronDownOutline
                      className={cn("size-3 shrink-0 text-secondary transition-transform", {
                        "-rotate-90": isCollapsed,
                      })}
                    />
                    <ProjectBadge name={project.name} seed={project.id} logo={project.logo_props} />
                    <span className="font-semibold text-primary">{project.name}</span>
                    <span className="text-secondary tabular-nums">{section.epics.length}</span>
                  </button>
                )}
                {!isCollapsed &&
                  rows.map((epic) => {
                    const epicProject = getProjectById(epic.project_id);
                    const href = `/${workspaceSlug}/projects/${epic.project_id}/epics/${epic.id}`;
                    return (
                      // The row is a larger target for the pointer; the epic's link is the keyboard path
                      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
                      <div
                        key={epic.id}
                        role="row"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("button, a")) return;
                          router.push(href);
                        }}
                        className="grid min-h-11 cursor-pointer items-center gap-x-3 border-b border-subtle px-[18px] py-1 text-13 transition-colors duration-[120ms] hover:bg-layer-1-hover"
                        style={{ gridTemplateColumns: template }}
                      >
                        <span>
                          {epicProject && (
                            <ProjectBadge
                              name={epicProject.name}
                              seed={epicProject.id}
                              logo={epicProject.logo_props}
                              size={18}
                            />
                          )}
                        </span>
                        <span className="font-code text-12 text-secondary">
                          {epicProject?.identifier}-{epic.sequence_id}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <Link href={href} className="flex min-w-0 items-center gap-2 font-semibold text-primary">
                            <EpicStateIcon group={epic.state_group} />
                            <span className="truncate">{epic.name}</span>
                          </Link>
                          {epic.working && (
                            <EpicWorkingLine
                              name={epic.working.display_name}
                              identifier={`${epicProject?.identifier ?? ""}-${epic.working.sequence_id}`}
                            />
                          )}
                        </span>
                        <EpicProgressCell progress={epic.progress} width={130} />
                        {columns.map((column) => {
                          if (column === "health") return <EpicHealthCell key={column} epic={epic} />;
                          if (column === "lead") return <EpicLead key={column} userId={epic.lead_id} />;
                          return (
                            <span key={column} className="text-12 text-secondary">
                              {shortDate(epic.target_date)}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                {!isCollapsed && grouped !== false && (more > 0 || isExpanded) && project && (
                  <button
                    type="button"
                    onClick={() => setExpanded((state) => ({ ...state, [section.projectId]: !isExpanded }))}
                    className="block w-full border-b border-subtle py-1.5 pr-[18px] pl-12 text-left text-12 text-tertiary hover:text-secondary"
                  >
                    {isExpanded
                      ? t("epics.show_fewer")
                      : t("epics.more_in_project", { count: more, project: project.name })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
