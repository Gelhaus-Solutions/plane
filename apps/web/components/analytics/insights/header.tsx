/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSearchParams } from "react-router";
import { ChevronRightOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// components
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { INSIGHTS_TABS } from "./types";

const TAB_LABEL: Record<(typeof INSIGHTS_TABS)[number], string> = {
  overview: "workspace_analytics.insights.tabs.overview",
  "work-items": "workspace_analytics.insights.tabs.work_items",
  cycles: "workspace_analytics.insights.tabs.cycles",
  modules: "workspace_analytics.insights.tabs.modules",
  intake: "workspace_analytics.insights.tabs.intake",
  people: "workspace_analytics.insights.tabs.people",
};

/** The analytics page head (r5-10): the path, the title and the sections as underline tabs that keep the filters */
export const AnalyticsHeader = observer(function AnalyticsHeader() {
  const { workspaceSlug, tabId } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { sidebarCollapsed } = useAppTheme();
  const { currentWorkspace } = useWorkspace();
  const query = searchParams.toString();

  return (
    <header className="flex shrink-0 flex-col gap-2 px-[18px] pt-3">
      <div className="flex min-h-7 items-center gap-2">
        {sidebarCollapsed && <AppSidebarToggleButton />}
        <nav
          aria-label={t("aria_labels.breadcrumb.trail")}
          className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
        >
          <Link href={`/${workspaceSlug}/`} className="truncate hover:text-primary">
            {currentWorkspace?.name}
          </Link>
          <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
          <span className="truncate text-primary">{t("workspace_analytics.label")}</span>
        </nav>
      </div>
      <h1 className="text-22 leading-[1.2] font-semibold tracking-[-0.02em] text-primary">
        {t("workspace_analytics.label")}
      </h1>
      <nav
        aria-label={t("workspace_analytics.insights.sections")}
        className="-mx-[18px] flex gap-0.5 overflow-x-auto border-b border-strong px-2.5"
      >
        {INSIGHTS_TABS.map((tab) => {
          const isActive = tab === tabId;
          return (
            <Link
              key={tab}
              href={`/${workspaceSlug}/analytics/${tab}/${query ? `?${query}` : ""}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex h-[38px] shrink-0 items-center px-2.5 text-13 font-medium whitespace-nowrap text-secondary transition-colors duration-[120ms] outline-none hover:text-primary focus-visible:text-primary",
                {
                  "text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-[2px] after:bg-accent-primary":
                    isActive,
                }
              )}
            >
              {t(TAB_LABEL[tab])}
            </Link>
          );
        })}
      </nav>
    </header>
  );
});
