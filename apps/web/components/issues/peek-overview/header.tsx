/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import {
  ChevronDownOutline,
  ChevronUpOutline,
  CloseOutline,
  FullScreenPeekOutline,
  LinkOutline,
  ModalPeekOutline,
  NewTabOutline,
  SidePeekOutline,
} from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setToast } from "@plane/blocks/toast";
import { StateGroupIcon } from "@plane/blocks/icons";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Icon } from "@makeplane/propel/components/icon";
import { Button } from "@makeplane/propel/elements/button";
import type { TNameDescriptionLoader } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { cn, copyUrlToClipboard, generateWorkItemLink } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { IssueSubscription } from "../issue-detail/subscription";
import { WorkItemDetailQuickActions } from "../issue-layouts/quick-action-dropdowns";
import { NameDescriptionUpdateStatus } from "../issue-update-status";

export type TPeekModes = "side-peek" | "modal" | "full-screen";

type TPeekOption = { key: TPeekModes; icon: typeof SidePeekOutline; i18n_title: string };

const PEEK_OPTIONS: TPeekOption[] = [
  {
    key: "side-peek",
    icon: SidePeekOutline,
    i18n_title: "common.side_peek",
  },
  {
    key: "modal",
    icon: ModalPeekOutline,
    i18n_title: "common.modal",
  },
  {
    key: "full-screen",
    icon: FullScreenPeekOutline,
    i18n_title: "common.full_screen",
  },
];

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const KBD = "inline-flex h-4 items-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 font-medium text-secondary";

export type PeekOverviewHeaderProps = {
  peekMode: TPeekModes;
  setPeekMode: (value: TPeekModes) => void;
  removeRoutePeekId: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isArchived: boolean;
  disabled: boolean;
  embedIssue: boolean;
  toggleDeleteIssueModal: (value: boolean) => void;
  toggleArchiveIssueModal: (value: boolean) => void;
  toggleDuplicateIssueModal: (value: boolean) => void;
  toggleEditIssueModal: (value: boolean) => void;
  handleRestoreIssue: () => Promise<void>;
  isSubmitting: TNameDescriptionLoader;
  /** The previous and next work item of the layout behind the peek; absent when the peek is embedded. */
  navigation?: { hasPrevious: boolean; hasNext: boolean; move: (step: -1 | 1) => void };
};

/**
 * The peek's head (5A): the item's state and ID, then K and J, the peek layouts, Open and close; the page actions
 * (copy link, subscribe, more) sit before them.
 */
export const IssuePeekOverviewHeader = observer(function IssuePeekOverviewHeader(props: PeekOverviewHeaderProps) {
  const {
    peekMode,
    setPeekMode,
    workspaceSlug,
    projectId,
    issueId,
    isArchived,
    disabled,
    embedIssue = false,
    removeRoutePeekId,
    toggleDeleteIssueModal,
    toggleArchiveIssueModal,
    toggleDuplicateIssueModal,
    toggleEditIssueModal,
    handleRestoreIssue,
    isSubmitting,
    navigation,
  } = props;
  // ref
  const parentRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  // store hooks
  const { data: currentUser } = useUser();
  const {
    issue: { getIssueById },
    setPeekIssue,
    removeIssue,
    archiveIssue,
    getIsIssuePeeked,
  } = useIssueDetail();
  const { isMobile } = usePlatformOS();
  const { getProjectIdentifierById } = useProject();
  const { getStateById } = useProjectState();
  // derived values
  const issueDetails = getIssueById(issueId);
  const stateDetails = issueDetails?.state_id ? getStateById(issueDetails.state_id) : undefined;
  const projectIdentifier = getProjectIdentifierById(issueDetails?.project_id);
  const {
    issues: { removeIssue: removeArchivedIssue },
  } = useIssues(EIssuesStoreType.ARCHIVED);
  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issueDetails?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issueDetails?.sequence_id,
    isArchived,
  });

  const handleCopyText = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    void copyUrlToClipboard(workItemLink).then(() =>
      setToast({ type: "success", title: t("common.link_copied"), compact: true })
    );
  };

  const handleDeleteIssue = async () => {
    try {
      const deleteIssue = issueDetails?.archived_at ? removeArchivedIssue : removeIssue;

      return deleteIssue(workspaceSlug, projectId, issueId).then(() => setPeekIssue(undefined));
    } catch (_error) {
      setToast({
        title: t("toast.error"),
        type: "error",
        message: t("entity.delete.failed", { entity: t("issue.label", { count: 1 }) }),
      });
    }
  };

  const handleArchiveIssue = async () => {
    await archiveIssue(workspaceSlug, projectId, issueId);
    // check and remove if issue is peeked
    if (getIsIssuePeeked(issueId)) {
      removeRoutePeekId();
    }
  };

  return (
    <div
      className={cn("flex h-[46px] shrink-0 items-center gap-1.5 border-b border-subtle pr-2.5 pl-3.5", {
        "pr-3.5": embedIssue,
      })}
    >
      {stateDetails && (
        <Tooltip label={stateDetails.name} disabled={isMobile}>
          <span className="flex shrink-0">
            <StateGroupIcon stateGroup={stateDetails.group} color={stateDetails.color} className="size-3.5" />
          </span>
        </Tooltip>
      )}
      {projectIdentifier && issueDetails && (
        <span className="shrink-0 font-code text-[12.5px] text-secondary">
          {projectIdentifier}-{issueDetails.sequence_id}
        </span>
      )}
      <span className="flex-1" />
      <NameDescriptionUpdateStatus isSubmitting={isSubmitting} />
      <div className="flex items-center gap-0.5">
        <Tooltip label={t("common.actions.copy_link")} disabled={isMobile} side="bottom">
          <IconButton
            variant="ghost"
            size="md"
            onClick={handleCopyText}
            icon={<Icon icon={LinkOutline} />}
            aria-label={t("common.actions.copy_link")}
          />
        </Tooltip>
        {currentUser && !isArchived && (
          <IssueSubscription workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} compact />
        )}
        {issueDetails && (
          <WorkItemDetailQuickActions
            parentRef={parentRef}
            issue={issueDetails}
            handleDelete={handleDeleteIssue}
            handleArchive={handleArchiveIssue}
            handleRestore={handleRestoreIssue}
            readOnly={disabled}
            toggleDeleteIssueModal={toggleDeleteIssueModal}
            toggleArchiveIssueModal={toggleArchiveIssueModal}
            toggleDuplicateIssueModal={toggleDuplicateIssueModal}
            toggleEditIssueModal={toggleEditIssueModal}
            isPeekMode
          />
        )}
      </div>
      {navigation && (
        <>
          <span className="bg-border-strong mx-0.5 h-4 w-px" aria-hidden="true" />
          <Tooltip label={t("work_item_peek.previous")} disabled={isMobile} side="bottom">
            <IconButton
              variant="ghost"
              size="md"
              icon={<Icon icon={ChevronUpOutline} />}
              aria-label={t("work_item_peek.previous")}
              aria-keyshortcuts="K"
              disabled={!navigation.hasPrevious}
              onClick={() => navigation.move(-1)}
            />
          </Tooltip>
          <Tooltip label={t("work_item_peek.next")} disabled={isMobile} side="bottom">
            <IconButton
              variant="ghost"
              size="md"
              icon={<Icon icon={ChevronDownOutline} />}
              aria-label={t("work_item_peek.next")}
              aria-keyshortcuts="J"
              disabled={!navigation.hasNext}
              onClick={() => navigation.move(1)}
            />
          </Tooltip>
        </>
      )}
      {!embedIssue && (
        <>
          <span className="bg-border-strong mx-0.5 h-4 w-px" aria-hidden="true" />
          <div
            role="group"
            aria-label={t("work_item_peek.layout")}
            className="flex items-center gap-px rounded-md bg-layer-2 p-0.5"
          >
            {PEEK_OPTIONS.map((option) => (
              <Tooltip key={option.key} label={t(option.i18n_title)} disabled={isMobile} side="bottom">
                <button
                  type="button"
                  aria-label={t(option.i18n_title)}
                  aria-pressed={peekMode === option.key}
                  onClick={() => setPeekMode(option.key)}
                  className={cn(
                    "grid size-6 place-items-center rounded-[5px] text-tertiary transition-colors hover:text-secondary",
                    { "ring-border-strong bg-surface-1 text-primary shadow-e1 ring-1": peekMode === option.key }
                  )}
                >
                  <option.icon className="size-3.5" />
                </button>
              </Tooltip>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            stretch="auto"
            render={<Link href={workItemLink} onClick={() => removeRoutePeekId()} />}
            aria-keyshortcuts={IS_MAC ? "Meta+Enter" : "Control+Enter"}
          >
            <Icon icon={NewTabOutline} />
            {t("work_item_peek.open")}
            <kbd className={KBD}>{IS_MAC ? "⌘↵" : "Ctrl ↵"}</kbd>
          </Button>
        </>
      )}
      <Tooltip label={t("common.close_peek_view")} disabled={isMobile} side="bottom">
        <IconButton
          variant="ghost"
          size="md"
          icon={<Icon icon={CloseOutline} />}
          aria-label={t("common.close_peek_view")}
          aria-keyshortcuts="Escape"
          onClick={removeRoutePeekId}
        />
      </Tooltip>
    </div>
  );
});
