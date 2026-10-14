/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import {
  AddOutline,
  CalendarOutline,
  ChevronRightOutline,
  EpicOutline,
  LinkOutline,
  MoreHorizontalOutline,
  NewTabOutline,
  TrendUpOutline,
} from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { StateGroupIcon } from "@plane/blocks/icons";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TEpicDetail, TIssue, TNameDescriptionLoader } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { copyTextToClipboard, generateWorkItemLink } from "@plane/utils";
// components
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
import type { TIssueOperations } from "@/components/issues/issue-detail/root";
import { IssueTitleInput } from "@/components/issues/title-input";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useEpic } from "@/hooks/store/use-epic";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { SizeTag, WaveTag } from "../fields";
import { EpicProgressBar, PROGRESS_SEGMENTS, progressPercent, shortDate } from "../parts";
import { sortEpics } from "../project-epics";
import { EpicBurnup } from "./burnup";
import { EpicRail } from "./rail";
import { EpicWorkItems } from "./work-items";

type Props = { workspaceSlug: string; projectId: string; epicId: string };

const BUCKET_ICON = {
  completed: { group: "completed", review: false },
  review: { group: "started", review: true },
  started: { group: "started", review: false },
  unstarted: { group: "unstarted", review: false },
  backlog: { group: "backlog", review: false },
} as const;

/** One epic (r4-12): its goal, progress with a burn-up, its work items by state, and the rail. */
export const EpicDetailRoot = observer(function EpicDetailRoot(props: Props) {
  const { workspaceSlug, projectId, epicId } = props;
  const { t } = useTranslation();
  const router = useRouter();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { getProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const { detailMap, fetchEpicDetail, fetchWaves, fetchProjectEpics, getProjectEpics, getWaveById } = useEpic();
  const {
    fetchIssue,
    updateIssue,
    removeIssue,
    issue: { getIssueById },
  } = useIssueDetail();
  // states
  const [isSubmitting, setIsSubmitting] = useState<TNameDescriptionLoader>("saved");
  const [notFound, setNotFound] = useState(false);
  // derived values
  const project = getProjectById(projectId);
  const epic = detailMap[epicId];
  const issue = getIssueById(epicId);
  const wave = getWaveById(projectId, epic?.wave_id);
  const isEditable = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const refresh = useCallback(
    () =>
      fetchEpicDetail(workspaceSlug, projectId, epicId).catch(() => {
        setNotFound(true);
        return undefined;
      }),
    [workspaceSlug, projectId, epicId, fetchEpicDetail]
  );

  useEffect(() => {
    setNotFound(false);
    void refresh();
    void fetchIssue(workspaceSlug, projectId, epicId).catch(() => undefined);
    void fetchWaves(workspaceSlug, projectId);
    void fetchProjectEpics(workspaceSlug, projectId);
  }, [workspaceSlug, projectId, epicId, refresh, fetchIssue, fetchWaves, fetchProjectEpics]);

  // J and K walk the project's epics in the list's order
  const projectEpics = getProjectEpics(projectId);
  const siblings = useMemo(() => sortEpics(projectEpics ?? [], "target"), [projectEpics]);
  const position = siblings.findIndex((item) => item.id === epicId);
  const go = useCallback(
    (step: number) => {
      const next = siblings[position + step];
      if (next) router.push(`/${workspaceSlug}/projects/${projectId}/epics/${next.id}`);
    },
    [siblings, position, router, workspaceSlug, projectId]
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingInInput(event.target)) return;
      if (document.querySelector("[role=dialog], [role=menu], [role=listbox]")) return;
      if (event.key === "j") go(1);
      if (event.key === "k") go(-1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [go]);

  const issueOperations: TIssueOperations = useMemo(
    () => ({
      fetch: async (slug, project_id, issueId) => {
        await fetchIssue(slug, project_id, issueId);
      },
      update: async (slug, project_id, issueId, data) => {
        await updateIssue(slug, project_id, issueId, data);
        void refresh();
      },
      remove: async (slug, project_id, issueId) => {
        await removeIssue(slug, project_id, issueId);
      },
    }),
    [fetchIssue, updateIssue, removeIssue, refresh]
  );

  const workItemLink = epic
    ? generateWorkItemLink({
        workspaceSlug,
        projectId,
        issueId: epic.id,
        projectIdentifier: project?.identifier,
        sequenceId: epic.sequence_id,
      })
    : "";

  const copyLink = () =>
    void copyTextToClipboard(window.location.href).then(() =>
      setToast({ type: "success", title: t("common.link_copied"), compact: true })
    );

  if (notFound && !epic)
    return <div className="grid size-full place-items-center text-13 text-secondary">{t("epics.empty.title")}</div>;

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-[18px]">
        {sidebarCollapsed && <AppSidebarToggleButton />}
        <nav
          aria-label={t("aria_labels.breadcrumb.trail")}
          className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary"
        >
          <Link href={`/${workspaceSlug}/projects/${projectId}/issues/`} className="truncate hover:text-primary">
            {project?.name}
          </Link>
          <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
          <Link href={`/${workspaceSlug}/projects/${projectId}/epics/`} className="truncate hover:text-primary">
            {t("epics.title")}
          </Link>
          <ChevronRightOutline className="size-3 shrink-0 text-tertiary" />
          <span aria-current="page" className="shrink-0">
            {project?.identifier}-{epic?.sequence_id}
          </span>
        </nav>
        <span className="flex-1" />
        {position >= 0 && siblings.length > 1 && (
          <span className="flex items-center gap-1 text-12 text-secondary tabular-nums">
            {t("epics.detail.position", { index: position + 1, total: siblings.length })}
            <Tooltip label={t("epics.detail.next")} side="bottom">
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t("epics.detail.next")}
                className="rounded bg-layer-3 px-1 font-code text-[10.5px] leading-4 text-secondary hover:text-primary"
              >
                J
              </button>
            </Tooltip>
            <Tooltip label={t("epics.detail.previous")} side="bottom">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t("epics.detail.previous")}
                className="rounded bg-layer-3 px-1 font-code text-[10.5px] leading-4 text-secondary hover:text-primary"
              >
                K
              </button>
            </Tooltip>
          </span>
        )}
        <Tooltip label={t("copy_link")} side="bottom">
          <IconButton
            size="md"
            variant="ghost"
            icon={<Icon icon={LinkOutline} />}
            aria-label={t("copy_link")}
            onClick={copyLink}
          />
        </Tooltip>
        <Menu>
          <MenuTrigger
            render={
              <IconButton
                size="md"
                variant="ghost"
                icon={<Icon icon={MoreHorizontalOutline} />}
                aria-label={t("work_items_header.more_actions")}
              />
            }
          />
          <MenuContent side="bottom" align="end">
            <MenuItem
              icon={<Icon icon={NewTabOutline} />}
              label={t("epics.detail.open_as_work_item")}
              onClick={() => router.push(workItemLink)}
            />
          </MenuContent>
        </Menu>
      </header>

      {epic && (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-9 pt-6 pb-12">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 items-center gap-1 rounded-md border border-strong px-1.5 text-[11.5px] text-primary">
                    <EpicOutline className="size-3 text-accent-primary" />
                    {t("epics.detail.type")}
                  </span>
                  <span className="font-code text-[12.5px] text-secondary">
                    {project?.identifier}-{epic.sequence_id}
                  </span>
                  {wave && <WaveTag code={wave.code} />}
                  {epic.size && <SizeTag size={epic.size} />}
                </div>
                {issue ? (
                  <IssueTitleInput
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={epic.id}
                    isSubmitting={isSubmitting}
                    setIsSubmitting={setIsSubmitting}
                    issueOperations={issueOperations}
                    disabled={!isEditable}
                    value={issue.name}
                    titleClassName="text-[26px] leading-[1.2] font-semibold tracking-[-0.022em]"
                  />
                ) : (
                  <h1 className="text-[26px] leading-[1.2] font-semibold tracking-[-0.022em] text-primary">
                    {epic.name}
                  </h1>
                )}
              </div>

              {issue && (
                <DescriptionInput
                  issueSequenceId={issue.sequence_id}
                  containerClassName="-ml-6 border-none p-0! pl-6!"
                  disabled={!isEditable}
                  entityId={issue.id}
                  fileAssetType={EFileAssetType.ISSUE_DESCRIPTION}
                  initialValue={issue.description_html ?? epic.description_html}
                  key={issue.id}
                  onSubmit={async (value) => {
                    await issueOperations.update(workspaceSlug, projectId, issue.id, {
                      description_html: value.description_html,
                    });
                  }}
                  projectId={projectId}
                  setIsSubmitting={setIsSubmitting}
                  workspaceSlug={workspaceSlug}
                />
              )}

              <EpicProgress epic={epic} />

              <EpicWorkItems
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                epicId={epicId}
                reviewStateIds={epic.review_state_ids}
                disabled={!isEditable}
                onChange={() => void refresh()}
              />
            </div>
          </div>
          <EpicRail
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            epic={epic}
            issue={issue}
            isEditable={isEditable}
            updateIssue={(data: Partial<TIssue>) => issueOperations.update(workspaceSlug, projectId, epic.id, data)}
          />
        </div>
      )}
    </div>
  );
});

/** The progress panel: the share done, the bar with its legend, target and pace, and the burn-up. */
function EpicProgress(props: { epic: TEpicDetail }) {
  const { epic } = props;
  const { t } = useTranslation();
  const progress = epic.progress;
  const inProgress = progress.started + progress.review;
  return (
    <section
      aria-label={t("epics.columns.progress")}
      className="grid grid-cols-1 items-start gap-5 rounded-xl border border-strong bg-surface-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[28px] leading-none font-semibold tracking-[-0.02em] text-primary tabular-nums">
            {t("epics.detail.percent", { percent: progressPercent(progress) })}
          </span>
          <span className="text-13 text-secondary">
            {t("epics.detail.summary", { done: progress.completed, total: progress.total, started: inProgress })}
          </span>
        </div>
        <EpicProgressBar progress={progress} height={10} gap={2} />
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-12 text-secondary">
          {PROGRESS_SEGMENTS.map((segment) => (
            <span key={segment.key} className="flex items-center gap-[5px]">
              <StateGroupIcon
                stateGroup={BUCKET_ICON[segment.key].group}
                review={BUCKET_ICON[segment.key].review}
                size="sm"
              />
              {t(`epics.detail.bucket.${segment.key}`)} {progress[segment.key]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-[12.5px] text-secondary">
          <span className="inline-flex h-5 items-center gap-[5px] rounded-[10px] border border-strong px-[7px] text-[11.5px]">
            <CalendarOutline className="size-[11px]" />
            {epic.target_date ? t("epics.detail.target", { date: shortDate(epic.target_date) }) : t("epics.no_target")}
          </span>
          {epic.projected_date && (
            <span className="inline-flex h-5 items-center gap-[5px] rounded-[10px] border border-strong px-[7px] text-[11.5px]">
              <TrendUpOutline className="size-[11px]" />
              {t("epics.detail.pace", { date: shortDate(epic.projected_date) })}
            </span>
          )}
          {epic.added_this_month > 0 && (
            <span className="inline-flex h-5 items-center gap-[5px] rounded-[10px] border border-strong px-[7px] text-[11.5px]">
              <AddOutline className="size-[11px]" />
              {t("epics.detail.added_this_month", { count: epic.added_this_month })}
            </span>
          )}
        </div>
      </div>
      <EpicBurnup points={epic.burnup} />
    </section>
  );
}
