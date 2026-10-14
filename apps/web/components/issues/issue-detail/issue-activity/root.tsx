/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Avatar } from "@makeplane/propel/components/avatar";
import { HistoryOutline } from "@makeplane/propel/icons";
// plane package imports
import type { TActivityFilters } from "@plane/constants";
import { E_SORT_ORDER, EActivityFilterType, defaultActivityFilters } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
// i18n
import { useTranslation } from "@plane/i18n";
//types
import type { TFileSignedURLResponse, TIssueComment } from "@plane/types";
import { cn, getFileURL } from "@plane/utils";
// components
import { CommentCreate } from "@/components/comments/comment-create";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
// local imports
import { IssueSubscription } from "../subscription";
import { IssueActivityCommentRoot } from "./activity-comment-root";
import { useWorkItemCommentOperations } from "./helper";

type TActivityView = "all" | "comments" | "history";

/** The filter types each tab of the activity shows (4A: All, Comments, History) */
const VIEW_FILTERS: Record<TActivityView, TActivityFilters[]> = {
  all: defaultActivityFilters,
  comments: [EActivityFilterType.COMMENT],
  history: defaultActivityFilters.filter((filter) => filter !== EActivityFilterType.COMMENT),
};

const toView = (filters: TActivityFilters[]): TActivityView => {
  if (!filters.includes(EActivityFilterType.COMMENT)) return "history";
  return filters.length === 1 ? "comments" : "all";
};

type TIssueActivity = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  isIntakeIssue?: boolean;
};

export type TActivityOperations = {
  createComment: (data: Partial<TIssueComment>) => Promise<TIssueComment>;
  updateComment: (commentId: string, data: Partial<TIssueComment>) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
  uploadCommentAsset: (blockId: string, file: File, commentId?: string) => Promise<TFileSignedURLResponse>;
};

export const IssueActivity = observer(function IssueActivity(props: TIssueActivity) {
  const { workspaceSlug, projectId, issueId, disabled = false, isIntakeIssue = false } = props;
  // i18n
  const { t } = useTranslation();
  // hooks
  const { setValue: setFilterValue, storedValue: selectedFilters } = useLocalStorage(
    "issue_activity_filters",
    defaultActivityFilters
  );

  const { getProjectById } = useProject();
  const { data: currentUser } = useUser();

  const view = toView(selectedFilters ?? defaultActivityFilters);

  // helper hooks
  const activityOperations = useWorkItemCommentOperations(workspaceSlug, projectId, issueId);

  const project = getProjectById(projectId);
  const renderCommentCreationBox = useMemo(
    () => (
      <div className="flex gap-2.5">
        <Avatar
          size="sm"
          alt={currentUser?.display_name}
          fallback={currentUser?.display_name?.[0]?.toUpperCase()}
          src={currentUser?.avatar_url ? getFileURL(currentUser.avatar_url) : undefined}
        />
        <div className="min-w-0 flex-1">
          <CommentCreate
            workspaceSlug={workspaceSlug}
            entityId={issueId}
            activityOperations={activityOperations}
            showToolbarInitially
            projectId={projectId}
          />
        </div>
      </div>
    ),
    [workspaceSlug, issueId, activityOperations, projectId, currentUser]
  );
  if (!project) return <></>;

  return (
    <section aria-label={t("work_item_detail.activity")} className="flex flex-col gap-3">
      <div className="flex h-[30px] items-center gap-2">
        <HistoryOutline className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
        <h2 className="text-[13.5px] font-semibold text-primary">{t("work_item_detail.activity")}</h2>
      </div>
      <div className="flex items-center gap-2">
        <div role="group" className="inline-flex items-center gap-0.5 rounded-lg bg-layer-2 p-0.5 text-12">
          {(["all", "comments", "history"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setFilterValue(VIEW_FILTERS[option])}
              className={cn(
                "flex h-6 items-center rounded-md px-[9px] text-secondary transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
                { "ring-border-strong bg-surface-1 font-semibold text-primary shadow-e1 ring-1": view === option }
              )}
            >
              {t(`work_item_detail.activity_${option}`)}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {currentUser && !disabled && !isIntakeIssue && (
          <IssueSubscription workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} compact />
        )}
      </div>
      <IssueActivityCommentRoot
        projectId={projectId}
        workspaceSlug={workspaceSlug}
        isIntakeIssue={isIntakeIssue}
        issueId={issueId}
        selectedFilters={selectedFilters || defaultActivityFilters}
        activityOperations={activityOperations}
        showAccessSpecifier={!!project.anchor}
        disabled={disabled}
        sortOrder={E_SORT_ORDER.ASC}
      />
      {!disabled && renderCommentCreationBox}
    </section>
  );
});
