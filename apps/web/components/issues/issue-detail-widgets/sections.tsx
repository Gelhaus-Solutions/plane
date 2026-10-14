/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { AddOutline, AttachOutline, LinkOutline, RelationsOutline, SubWorkItemsOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType, TWorkItemWidgets } from "@plane/types";
// components
import { useTimeLineRelationOptions } from "@/components/relations";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueAttachmentActionButton, IssueAttachmentsCollapsibleContent } from "./attachments";
import { IssueDetailWidgetModals } from "./issue-detail-widget-modals";
import { IssueLinksActionButton, IssueLinksCollapsibleContent } from "./links";
import { RelationActionButton, RelationsCollapsibleContent } from "./relations";
import { DetailSection, SectionIconButton } from "./section";
import { SubIssuesActionButton, SubIssuesCollapsibleContent } from "./sub-issues";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  renderWidgetModals?: boolean;
  issueServiceType: TIssueServiceType;
  hideWidgets?: TWorkItemWidgets[];
};

/**
 * The work item's sections under the description (4A, 5A): Sub-items with their progress, Relations grouped by kind,
 * then Links and Attachments. Each head carries its add action; the box shows only when there is something in it.
 */
export const IssueDetailSections = observer(function IssueDetailSections(props: Props) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    disabled,
    renderWidgetModals = true,
    issueServiceType,
    hideWidgets,
  } = props;
  const { t } = useTranslation();
  // store hooks
  const {
    issue: { getIssueById },
    subIssues: { subIssuesByIssueId, stateDistributionByIssueId },
    attachment: { getAttachmentsCountByIssueId, getAttachmentsUploadStatusByIssueId },
    relation: { getRelationCountByIssueId },
  } = useIssueDetail(issueServiceType);
  const relationOptions = useTimeLineRelationOptions();
  // derived values
  const issue = getIssueById(issueId);
  const subIssueCount = subIssuesByIssueId(issueId)?.length ?? issue?.sub_issues_count ?? 0;
  const doneCount = stateDistributionByIssueId(issueId)?.completed?.length ?? 0;
  const relationCount = getRelationCountByIssueId(issueId, relationOptions);
  const linkCount = issue?.link_count ?? 0;
  const attachmentCount = getAttachmentsCountByIssueId(issueId);
  const hasUploads = (getAttachmentsUploadStatusByIssueId(issueId)?.length ?? 0) > 0;
  const show = (widget: TWorkItemWidgets) => !hideWidgets?.includes(widget);

  return (
    <>
      {show("sub-work-items") && (
        <DetailSection
          icon={<SubWorkItemsOutline />}
          label={t("work_item_detail.sub_items")}
          count={subIssueCount}
          right={
            <>
              {subIssueCount > 0 && (
                <span className="flex items-center gap-1.5 text-12 text-secondary tabular-nums">
                  <span className="h-1 w-[72px] overflow-hidden rounded-full bg-layer-3">
                    <span
                      className="block h-full rounded-full bg-accent-primary transition-[width] duration-[320ms]"
                      style={{ width: `${(doneCount / subIssueCount) * 100}%` }}
                    />
                  </span>
                  {t("work_item_detail.progress", { done: doneCount, total: subIssueCount })}
                </span>
              )}
              {!disabled && (
                <SubIssuesActionButton
                  issueId={issueId}
                  disabled={disabled}
                  issueServiceType={issueServiceType}
                  customButton={
                    <button
                      type="button"
                      aria-label={t("work_item_detail.add_sub_items")}
                      className="grid size-6 place-items-center rounded-[7px] text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                    >
                      <AddOutline className="size-3.5" />
                    </button>
                  }
                />
              )}
            </>
          }
        >
          {subIssueCount > 0 && (
            // rows draw their bottom rule; the last one tucks under the box's border
            <div className="-mb-px">
              <SubIssuesCollapsibleContent
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                parentIssueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </div>
          )}
        </DetailSection>
      )}
      {show("relations") && (
        <DetailSection
          icon={<RelationsOutline />}
          label={t("work_item_detail.relations")}
          count={relationCount}
          right={
            !disabled && (
              <RelationActionButton
                issueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
                customButton={
                  <button
                    type="button"
                    className="flex h-6 items-center gap-1.5 rounded-[7px] px-2 text-12 font-medium text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                  >
                    <AddOutline className="size-3.5" />
                    {t("work_item_detail.add_relation")}
                  </button>
                }
              />
            )
          }
        >
          {relationCount > 0 && (
            <RelationsCollapsibleContent
              workspaceSlug={workspaceSlug}
              issueId={issueId}
              disabled={disabled}
              issueServiceType={issueServiceType}
            />
          )}
        </DetailSection>
      )}
      {show("links") && (
        <DetailSection
          icon={<LinkOutline />}
          label={t("work_item_detail.links")}
          count={linkCount}
          right={
            !disabled && (
              <IssueLinksActionButton
                disabled={disabled}
                issueServiceType={issueServiceType}
                customButton={<SectionIconButton icon={<AddOutline />} label={t("work_item_detail.add_link")} />}
              />
            )
          }
        >
          {linkCount > 0 && (
            <div className="p-1.5">
              <IssueLinksCollapsibleContent
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </div>
          )}
        </DetailSection>
      )}
      {show("attachments") && (
        <DetailSection
          icon={<AttachOutline />}
          label={t("work_item_detail.attachments")}
          count={attachmentCount}
          right={
            !disabled && (
              <IssueAttachmentActionButton
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
                customButton={<SectionIconButton icon={<AddOutline />} label={t("work_item_detail.attach_file")} />}
              />
            )
          }
        >
          {(attachmentCount > 0 || hasUploads) && (
            <div className="p-1.5">
              <IssueAttachmentsCollapsibleContent
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </div>
          )}
        </DetailSection>
      )}
      {renderWidgetModals && (
        <IssueDetailWidgetModals
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueServiceType={issueServiceType}
          hideWidgets={hideWidgets}
        />
      )}
    </>
  );
});
