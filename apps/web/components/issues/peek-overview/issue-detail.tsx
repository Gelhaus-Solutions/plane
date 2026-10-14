// oxlint-disable no-shadow
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import type { TNameDescriptionLoader } from "@plane/types";
// components
import { DescriptionVersionsRoot } from "@/components/core/description-versions";
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import useReloadConfirmations from "@/hooks/use-reload-confirmation";
// plane web hooks
// services
import { WorkItemVersionService } from "@/services/issue";
// local components
import type { TIssueOperations } from "../issue-detail";
import { IssueParentDetail } from "../issue-detail/parent";
import { IssueReaction } from "../issue-detail/reactions";
import { IssueTitleInput } from "../title-input";
// services init
const workItemVersionService = new WorkItemVersionService();

type Props = {
  editorRef: React.RefObject<EditorRefApi | null>;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
  isArchived: boolean;
  isSubmitting: TNameDescriptionLoader;
  setIsSubmitting: (value: TNameDescriptionLoader) => void;
  /** The properties grid, drawn between the title and the description (5A) */
  properties?: ReactNode;
};

export const PeekOverviewIssueDetails = observer(function PeekOverviewIssueDetails(props: Props) {
  const {
    editorRef,
    workspaceSlug,
    issueId,
    issueOperations,
    disabled,
    isArchived,
    isSubmitting,
    setIsSubmitting,
    properties,
  } = props;
  // store hooks
  const { data: currentUser } = useUser();
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  const { getUserDetails } = useMember();
  // reload confirmation
  const { setShowAlert } = useReloadConfirmations(isSubmitting === "submitting");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isSubmitting === "submitted") {
      setShowAlert(false);
      timer = setTimeout(() => setIsSubmitting("saved"), 2000);
    } else if (isSubmitting === "submitting") {
      setShowAlert(true);
    }
    return () => clearTimeout(timer);
  }, [isSubmitting, setShowAlert, setIsSubmitting]);

  // derived values
  const issue = issueId ? getIssueById(issueId) : undefined;

  if (!issue || !issue.project_id) return <></>;

  const issueDescription =
    issue.description_html !== undefined || issue.description_html !== null
      ? issue.description_html != ""
        ? issue.description_html
        : "<p></p>"
      : undefined;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2.5">
        {issue.parent_id && (
          <div className="flex">
            <IssueParentDetail workspaceSlug={workspaceSlug} issue={issue} />
          </div>
        )}
        <IssueTitleInput
          workspaceSlug={workspaceSlug}
          projectId={issue.project_id}
          issueId={issue.id}
          isSubmitting={isSubmitting}
          setIsSubmitting={(value) => setIsSubmitting(value)}
          issueOperations={issueOperations}
          disabled={disabled || isArchived}
          value={issue.name}
          titleClassName="text-[21px] leading-[1.25] font-semibold tracking-[-0.018em]"
        />
      </div>

      {properties}

      <div className="flex flex-col gap-3">
        <DescriptionInput
          issueSequenceId={issue.sequence_id}
          containerClassName="-ml-3 border-none"
          disabled={disabled || isArchived}
          editorRef={editorRef}
          entityId={issue.id}
          fileAssetType={EFileAssetType.ISSUE_DESCRIPTION}
          initialValue={issueDescription}
          key={issue.id}
          onSubmit={async (value, isMigrationUpdate) => {
            if (!issue.id || !issue.project_id) return;
            await issueOperations.update(workspaceSlug, issue.project_id, issue.id, {
              description_html: value.description_html,
              ...(isMigrationUpdate ? { skip_activity: "true" } : {}),
            });
          }}
          setIsSubmitting={(value) => setIsSubmitting(value)}
          projectId={issue.project_id}
          workspaceSlug={workspaceSlug}
        />

        <div className="flex items-center justify-between gap-2">
          {currentUser && (
            <IssueReaction
              workspaceSlug={workspaceSlug}
              projectId={issue.project_id}
              issueId={issueId}
              currentUser={currentUser}
              disabled={isArchived}
            />
          )}
          {!disabled && (
            <DescriptionVersionsRoot
              className="flex-shrink-0"
              entityInformation={{
                createdAt: issue.created_at ? new Date(issue.created_at) : new Date(),
                createdByDisplayName: getUserDetails(issue.created_by ?? "")?.display_name ?? "",
                id: issueId,
                isRestoreDisabled: disabled || isArchived,
              }}
              fetchHandlers={{
                listDescriptionVersions: (issueId) =>
                  workItemVersionService.listDescriptionVersions(
                    workspaceSlug,
                    issue.project_id?.toString() ?? "",
                    issueId
                  ),
                retrieveDescriptionVersion: (issueId, versionId) =>
                  workItemVersionService.retrieveDescriptionVersion(
                    workspaceSlug,
                    issue.project_id?.toString() ?? "",
                    issueId,
                    versionId
                  ),
              }}
              handleRestore={(descriptionHTML) => editorRef.current?.setEditorValue(descriptionHTML, true)}
              projectId={issue.project_id}
              workspaceSlug={workspaceSlug}
            />
          )}
        </div>
      </div>
    </div>
  );
});
