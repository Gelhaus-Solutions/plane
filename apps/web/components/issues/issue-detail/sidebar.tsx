/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ArrowNarrowRightOutline } from "@makeplane/propel/icons";
// i18n
import { useTranslation } from "@plane/i18n";
// ui
import { DateSelect } from "@plane/blocks/property-select";
import { cn, getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { EstimateSelect } from "@/components/dropdowns/estimate/estimate-select";
import { MemberSelect } from "@/components/dropdowns/member/member-select";
import { PrioritySelect } from "@/components/dropdowns/priority/priority-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserProfile } from "@/hooks/store/user";
// components
import { IssueParentSelectRoot } from "@/components/issues/parent-select-root";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { IssueCycleSelect } from "./cycle-select";
import { IssueLabel } from "./label";
import { IssueModuleSelect } from "./module-select";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  isEditable: boolean;
};

/** The detail page's rail (4A): the work item's properties in one boxed section. */
export const IssueDetailsSidebar = observer(function IssueDetailsSidebar(props: Props) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, issueOperations, isEditable } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { data: userProfile } = useUserProfile();
  const issue = getIssueById(issueId);
  if (!issue) return <></>;

  // derived values
  const projectDetails = getProjectById(issue.project_id);
  const stateDetails = getStateById(issue.state_id);

  const minDate = issue.start_date ? getDate(issue.start_date) : null;
  minDate?.setDate(minDate.getDate());

  const maxDate = issue.target_date ? getDate(issue.target_date) : null;
  maxDate?.setDate(maxDate.getDate());

  return (
    <div className="flex size-full flex-col gap-3 overflow-y-auto p-3.5">
      <section
        aria-labelledby="work-item-properties-heading"
        className="rounded-xl border border-strong bg-surface-1 shadow-e1"
      >
        <h2
          id="work-item-properties-heading"
          className="flex h-[38px] items-center border-b border-subtle px-3 text-[10.5px] font-semibold tracking-[0.08em] text-secondary uppercase"
        >
          {t("work_item_detail.properties")}
        </h2>
        <div className={cn("flex flex-col px-3 pt-1.5 pb-2.5", { "opacity-60": !isEditable })}>
          <SidebarPropertyListItem label={t("common.state")}>
            <StateSelect
              testId="work-item-state-select"
              value={issue?.state_id}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
              projectId={projectId}
              disabled={!isEditable}
              variant="select-ghost-md"
              tooltip
            />
          </SidebarPropertyListItem>

          <SidebarPropertyListItem label={t("common.priority")}>
            <PrioritySelect
              testId="work-item-priority-select"
              value={issue?.priority}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
              disabled={!isEditable}
              variant="select-ghost-md"
              tooltip
            />
          </SidebarPropertyListItem>

          <SidebarPropertyListItem label={t("work_item_detail.assignee")}>
            <MemberSelect
              testId="work-item-assignee-select"
              value={issue?.assignee_ids ?? []}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
              disabled={!isEditable}
              projectId={projectId}
              placeholder={t("issue.add.assignee")}
              multiple
              variant="select-ghost-md"
              showLabel={(issue?.assignee_ids?.length ?? 0) <= 1}
              tooltip={{ heading: t("common.assignees") }}
            />
          </SidebarPropertyListItem>

          <SidebarPropertyListItem label={t("common.labels")}>
            <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={!isEditable} />
          </SidebarPropertyListItem>

          {projectDetails?.cycle_view && (
            <SidebarPropertyListItem label={t("common.cycles")}>
              <IssueCycleSelect
                className="h-7.5 w-full grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={!isEditable}
              />
            </SidebarPropertyListItem>
          )}

          {projectDetails?.module_view && (
            <SidebarPropertyListItem label={t("common.module")}>
              <IssueModuleSelect
                className="w-full grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={!isEditable}
              />
            </SidebarPropertyListItem>
          )}

          <SidebarPropertyListItem label={t("work_item_detail.dates")} childrenClassName="gap-0.5 flex-nowrap">
            <DateSelect
              testId="work-item-start-date-select"
              placeholder={t("common.order_by.start_date")}
              value={getDate(issue.start_date) ?? null}
              onChange={(val) =>
                issueOperations.update(workspaceSlug, projectId, issueId, {
                  start_date: val ? renderFormattedPayloadDate(val) : null,
                })
              }
              maxDate={maxDate ?? undefined}
              disabled={!isEditable}
              clearable
              weekStartsOn={userProfile?.start_of_the_week}
              variant="select-ghost-md"
              formatToken="MMM d"
              className="w-auto"
            />
            <ArrowNarrowRightOutline className="size-3 shrink-0 text-tertiary" aria-hidden="true" />
            <DateSelect
              testId="work-item-due-date-select"
              placeholder={t("common.order_by.due_date")}
              value={getDate(issue.target_date) ?? null}
              onChange={(val) =>
                issueOperations.update(workspaceSlug, projectId, issueId, {
                  target_date: val ? renderFormattedPayloadDate(val) : null,
                })
              }
              minDate={minDate ?? undefined}
              disabled={!isEditable}
              clearable
              className={cn("w-auto", {
                "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
              })}
              weekStartsOn={userProfile?.start_of_the_week}
              variant="select-ghost-md"
              formatToken="MMM d"
            />
          </SidebarPropertyListItem>

          {projectId && areEstimateEnabledByProjectId(projectId) && (
            <SidebarPropertyListItem label={t("common.estimate")}>
              <EstimateSelect
                value={issue?.estimate_point ?? undefined}
                onChange={(val: string | null) =>
                  issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
                }
                projectId={projectId}
                disabled={!isEditable}
                variant="select-ghost-md"
                placeholder={t("common.none")}
                tooltip
              />
            </SidebarPropertyListItem>
          )}

          <SidebarPropertyListItem label={t("common.parent")}>
            <IssueParentSelectRoot
              className="h-7.5 w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={!isEditable}
            />
          </SidebarPropertyListItem>
        </div>
      </section>
    </div>
  );
});
