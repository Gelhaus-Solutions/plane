/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useParams } from "react-router";
import type { LucideIcon } from "lucide-react";
import useSWR from "swr";
import {
  ArrowNarrowLeftOutline,
  ChevronDownOutline,
  ChevronRightOutline,
  KeyOutline,
  LockOutline,
  SearchOutline,
  SettingsOutline,
  SubscribeOutline,
  UserOutline,
} from "@makeplane/propel/icons";
// plane imports
import {
  EUserPermissionsLevel,
  GROUPED_PROFILE_SETTINGS,
  GROUPED_PROJECT_SETTINGS,
  GROUPED_WORKSPACE_SETTINGS,
  PROFILE_SETTINGS_CATEGORIES,
  PROFILE_SETTINGS_CATEGORY_LABELS,
  PROJECT_SETTINGS_CATEGORIES,
  PROJECT_SETTINGS_CATEGORY_LABELS,
  WORKSPACE_MEMBER_ME_INFORMATION,
  WORKSPACE_PARTIAL_PROJECTS,
  WORKSPACE_PROJECTS_ROLES_INFORMATION,
  WORKSPACE_SETTINGS_CATEGORIES,
  WORKSPACE_SETTINGS_CATEGORY_LABELS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { ISvgIcons } from "@plane/blocks/icons";
import { ProjectBadge } from "@plane/blocks/project-badge";
import type { TProfileSettingsTabs } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions, useUserSettings } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { PROJECT_SETTINGS_ICONS } from "../project/sidebar/item-icon";
import { WORKSPACE_SETTINGS_ICONS } from "../workspace/sidebar/item-icon";

type TIcon = LucideIcon | React.FC<ISvgIcons>;

type TNavEntry = {
  key: string;
  label: string;
  href: string;
  icon: TIcon;
  isActive: boolean;
  /** the group the entry sits in, as upstream grouped its settings (D45) */
  group: string;
};

const PROFILE_ICONS: Record<TProfileSettingsTabs, TIcon> = {
  general: UserOutline,
  security: LockOutline,
  preferences: SettingsOutline,
  notifications: SubscribeOutline,
  "api-tokens": KeyOutline,
};

// The path with exactly one trailing slash, so "/a/settings" and "/a/settings/" compare equal
const withSlash = (path: string) => `${path.replace(/\/+$/, "")}/`;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary">
      {children}
    </kbd>
  );
}

function NavRow({ entry, indent = false }: { entry: TNavEntry; indent?: boolean }) {
  return (
    <Link href={entry.href} aria-current={entry.isActive ? "page" : undefined}>
      <SidebarNavItem isActive={entry.isActive} className={cn(indent && "pl-[30px]")}>
        <span className="flex min-w-0 items-center gap-[9px]">
          <entry.icon className="size-4 shrink-0" />
          <span className="truncate">{entry.label}</span>
        </span>
      </SidebarNavItem>
    </Link>
  );
}

/** The entries under their group labels, in order; a group with nothing to show is left out. */
function NavGroups({ entries, indent = false }: { entries: TNavEntry[]; indent?: boolean }) {
  const groups: { label: string; entries: TNavEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last?.label === entry.group) last.entries.push(entry);
    else groups.push({ label: entry.group, entries: [entry] });
  }
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} role="group" aria-label={group.label} className="flex flex-col gap-px">
          <div
            className={cn(
              "flex h-[22px] items-end px-2 pb-0.5 text-11 font-medium text-tertiary",
              indent && "pl-[30px]"
            )}
          >
            {group.label}
          </div>
          {group.entries.map((entry) => (
            <NavRow key={entry.key} entry={entry} indent={indent} />
          ))}
        </div>
      ))}
    </>
  );
}

function SectionHeading({
  label,
  open,
  count,
  onToggle,
}: {
  label: string;
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex h-6 w-full items-center gap-1.5 px-2 text-10-5 font-semibold tracking-[0.08em] text-secondary uppercase"
    >
      {open ? <ChevronDownOutline className="size-2.5" /> : <ChevronRightOutline className="size-2.5" />}
      {label}
      {!open && <span className="font-normal tracking-normal ml-auto text-tertiary normal-case">{count}</span>}
    </button>
  );
}

type Props = {
  /** The workspace whose settings the navigation lists; the account pages pass none and use the last one */
  workspaceSlug?: string;
  className?: string;
};

/**
 * The settings navigation (round 8, `settings.py`): in settings the sidebar becomes this, with the way back (Esc),
 * a search (/), the account, the workspace and one block per project.
 */
export const SettingsNavigation = observer(function SettingsNavigation(props: Props) {
  const { className } = props;
  const { workspaceSlug: routeWorkspaceSlug, projectId: routeProjectId } = useParams();
  const pathname = withSlash(usePathname() ?? "");
  const router = useAppRouter();
  const { t } = useTranslation();
  // store hooks
  const { data: userSettings, fetchCurrentUserSettings } = useUserSettings();
  const { allowPermissions, fetchUserWorkspaceInfo, fetchUserProjectPermissions } = useUserPermissions();
  const { joinedProjectIds, getPartialProjectById, fetchPartialProjects } = useProject();
  // derived values
  const workspaceSlug =
    props.workspaceSlug ?? routeWorkspaceSlug ?? userSettings?.workspace?.last_workspace_slug ?? undefined;
  // Outside a workspace (the account pages) nothing has loaded the workspace yet: load what the navigation needs
  const outsideWorkspace = !routeWorkspaceSlug;
  useSWR(
    outsideWorkspace ? "CURRENT_USER_SETTINGS" : null,
    outsideWorkspace ? () => fetchCurrentUserSettings() : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  const loadSlug = outsideWorkspace ? workspaceSlug : undefined;
  useSWR(
    loadSlug ? WORKSPACE_MEMBER_ME_INFORMATION(loadSlug) : null,
    loadSlug ? () => fetchUserWorkspaceInfo(loadSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  useSWR(
    loadSlug ? WORKSPACE_PROJECTS_ROLES_INFORMATION(loadSlug) : null,
    loadSlug ? () => fetchUserProjectPermissions(loadSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  useSWR(
    loadSlug ? WORKSPACE_PARTIAL_PROJECTS(loadSlug) : null,
    loadSlug ? () => fetchPartialProjects(loadSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  const backHref = routeProjectId
    ? `/${workspaceSlug}/projects/${routeProjectId}/issues/`
    : workspaceSlug
      ? `/${workspaceSlug}/`
      : "/";
  // states
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const account: TNavEntry[] = PROFILE_SETTINGS_CATEGORIES.flatMap((category) =>
    GROUPED_PROFILE_SETTINGS[category].map((item) => {
      const href = `/settings/profile/${item.key}/`;
      return {
        key: `account-${item.key}`,
        label: t(item.i18n_label),
        href,
        icon: PROFILE_ICONS[item.key],
        isActive: pathname === href,
        group: t(PROFILE_SETTINGS_CATEGORY_LABELS[category]),
      };
    })
  );

  const workspace: TNavEntry[] = workspaceSlug
    ? WORKSPACE_SETTINGS_CATEGORIES.flatMap((category) =>
        GROUPED_WORKSPACE_SETTINGS[category]
          .filter((item) => allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, workspaceSlug))
          .map((item) => {
            const href = withSlash(`/${workspaceSlug}${item.href}`);
            return {
              key: `workspace-${item.key}`,
              label: t(item.i18n_label),
              href,
              icon: WORKSPACE_SETTINGS_ICONS[item.key],
              // General is the section's root, so it is only active on its own page
              isActive: item.href === "/settings" ? pathname === href : pathname.startsWith(href),
              group: t(WORKSPACE_SETTINGS_CATEGORY_LABELS[category]),
            };
          })
      )
    : [];

  const projects = workspaceSlug
    ? joinedProjectIds.flatMap((projectId) => {
        const project = getPartialProjectById(projectId);
        if (!project) return [];
        const base = `/${workspaceSlug}/settings/projects/${projectId}`;
        const entries: TNavEntry[] = PROJECT_SETTINGS_CATEGORIES.flatMap((category) =>
          GROUPED_PROJECT_SETTINGS[category]
            .filter((item) => allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, projectId))
            .map((item) => {
              const href = withSlash(`${base}${item.href}`);
              return {
                key: `project-${projectId}-${item.key}`,
                label: t(item.i18n_label),
                href,
                icon: PROJECT_SETTINGS_ICONS[item.key],
                isActive: item.href === "" ? pathname === href : pathname.startsWith(href),
                group: t(PROJECT_SETTINGS_CATEGORY_LABELS[category]),
              };
            })
        );
        return [{ project, entries }];
      })
    : [];

  // Open the section the current page is in
  const activeSection = useMemo(() => {
    if (account.some((entry) => entry.isActive)) return "account";
    if (workspace.some((entry) => entry.isActive)) return "workspace";
    const project = projects.find((block) => block.entries.some((entry) => entry.isActive));
    return project ? `project-${project.project.id}` : undefined;
    // the entries are derived from the path, which is what matters here
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, projects.length]);

  useEffect(() => {
    if (!activeSection) return;
    setOpenSections((current) => (current.has(activeSection) ? current : new Set(current).add(activeSection)));
  }, [activeSection]);

  // Esc goes back to Plane and / searches, unless a field or a dialog has the keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
      if (isTypingInInput(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        router.push(backHref);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [backHref, router]);

  const toggle = (key: string) =>
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // While searching every section is open and shows only what matches
  const needle = query.trim().toLowerCase();
  const matches = (entry: TNavEntry) => !needle || entry.label.toLowerCase().includes(needle);
  const isOpen = (key: string) => !!needle || openSections.has(key);

  const accountShown = account.filter(matches);
  const workspaceShown = workspace.filter(matches);
  const projectsShown = projects
    .map(({ project, entries }) => ({
      project,
      entries: entries.filter((entry) => matches(entry) || (!!needle && project.name.toLowerCase().includes(needle))),
    }))
    .filter((block) => !needle || block.entries.length > 0);
  const nothingFound = !!needle && !accountShown.length && !workspaceShown.length && !projectsShown.length;

  return (
    <nav
      aria-label={t("settings")}
      className={cn("flex h-full w-[240px] shrink-0 flex-col gap-2.5 py-2.5 pr-2 pl-2.5", className)}
    >
      <Link href={backHref}>
        <SidebarNavItem className="h-[30px] text-secondary">
          <span className="flex min-w-0 items-center gap-[9px]">
            <ArrowNarrowLeftOutline className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings_shell.back_to_plane")}</span>
          </span>
          <Kbd>Esc</Kbd>
        </SidebarNavItem>
      </Link>
      <label className="mx-0.5 flex h-[30px] items-center gap-2 rounded-lg border border-strong bg-layer-1 px-2.5 text-13 focus-within:border-accent-strong">
        <SearchOutline className="size-[13px] shrink-0 text-tertiary" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (query) setQuery("");
              else e.currentTarget.blur();
            }
          }}
          placeholder={t("settings_shell.search")}
          aria-label={t("settings_shell.search")}
          className="min-w-0 flex-1 bg-transparent text-primary placeholder-(--text-color-placeholder) outline-none"
        />
        <Kbd>/</Kbd>
      </label>
      <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {accountShown.length > 0 && (
          <div className="flex flex-col gap-px">
            <SectionHeading
              label={t("settings_shell.my_account")}
              open={isOpen("account")}
              count={account.length}
              onToggle={() => toggle("account")}
            />
            {isOpen("account") && <NavGroups entries={accountShown} />}
          </div>
        )}
        {workspaceShown.length > 0 && (
          <div className="flex flex-col gap-px">
            <SectionHeading
              label={t("common.workspace")}
              open={isOpen("workspace")}
              count={workspace.length}
              onToggle={() => toggle("workspace")}
            />
            {isOpen("workspace") && <NavGroups entries={workspaceShown} />}
          </div>
        )}
        {projectsShown.length > 0 && (
          <div className="flex flex-col gap-px">
            <div className="flex h-6 items-center gap-1.5 px-2 text-10-5 font-semibold tracking-[0.08em] text-secondary uppercase">
              <ChevronDownOutline className="size-2.5" />
              {t("sidebar.projects")}
            </div>
            {projectsShown.map(({ project, entries }) => {
              const key = `project-${project.id}`;
              const open = isOpen(key);
              return (
                <div key={project.id} className="flex flex-col gap-px">
                  <button type="button" onClick={() => toggle(key)} aria-expanded={open} className="text-left">
                    <SidebarNavItem className="font-medium">
                      <span className="flex min-w-0 items-center gap-[9px]">
                        <ProjectBadge name={project.name} seed={project.id} logo={project.logo_props} />
                        <span className="truncate">{project.name}</span>
                      </span>
                      {open ? (
                        <ChevronDownOutline className="size-2.5 shrink-0 text-tertiary" />
                      ) : (
                        <ChevronRightOutline className="size-2.5 shrink-0 text-tertiary" />
                      )}
                    </SidebarNavItem>
                  </button>
                  {open && <NavGroups entries={entries} indent />}
                </div>
              );
            })}
          </div>
        )}
        {nothingFound && <p className="px-2 py-4 text-13 text-tertiary">{t("settings_shell.no_results")}</p>}
      </div>
    </nav>
  );
});
