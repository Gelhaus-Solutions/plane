/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
import { DateSelect } from "@plane/blocks/property-select";
import { cn, getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { EstimateSelect } from "@/components/dropdowns/estimate/estimate-select";
import { AssigneeSelect } from "@/components/dropdowns/assignee/assignee-select";
import { PrioritySelect } from "@/components/dropdowns/priority/priority-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// helpers
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserProfile } from "@/hooks/store/user";
// plane web components
import { IssueDelegateProperty } from "@/components/issues/issue-delegate-property";
import { IssueParentSelectRoot } from "@/components/issues/parent-select-root";
import type { TIssueOperations } from "../issue-detail";
import { IssueCycleSelect } from "../issue-detail/cycle-select";
import { IssueLabel } from "../issue-detail/label";
import { IssueModuleSelect } from "../issue-detail/module-select";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
  /** "grid" lays the properties out in two columns under the peek's title (5A); "list" is one column with a heading. */
  layout?: "grid" | "list";
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, layout = "list" } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { data: userProfile } = useUserProfile();
  // derived values
  const issue = getIssueById(issueId);
  if (!issue) return <></>;
  const projectDetails = getProjectById(issue.project_id);
  const isEstimateEnabled = projectDetails?.estimate;
  const stateDetails = getStateById(issue.state_id);

  const minDate = getDate(issue.start_date);
  minDate?.setDate(minDate.getDate());

  return (
    <section aria-label={t("common.properties")}>
      {layout === "list" && <h2 className="mb-2 text-body-xs-medium">{t("common.properties")}</h2>}
      <div
        className={cn("grid w-full grid-cols-1 gap-x-2.5", {
          "sm:grid-cols-2": layout === "grid",
          "opacity-60": disabled,
        })}
      >
        <SidebarPropertyListItem compact label={t("common.state")}>
          <StateSelect
            testId="work-item-state-select"
            value={issue?.state_id}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
            projectId={projectId}
            disabled={disabled}
            variant="select-ghost-md"
            tooltip
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem compact label={t("common.priority")}>
          <PrioritySelect
            testId="work-item-priority-select"
            value={issue?.priority}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
            disabled={disabled}
            variant="select-ghost-md"
            tooltip
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem compact label={t("work_item_detail.assignee")}>
          <AssigneeSelect
            testId="work-item-assignee-select"
            projectId={projectId}
            issueId={issueId}
            value={issue?.assignee_ids ?? []}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
            disabled={disabled}
            placeholder={t("issue.add.assignee")}
            variant="select-ghost-md"
            tooltip={{ heading: t("common.assignees") }}
          />
        </SidebarPropertyListItem>

        <IssueDelegateProperty
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          disabled={disabled}
          compact
        />

        <SidebarPropertyListItem compact label={t("common.labels")}>
          <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={disabled} />
        </SidebarPropertyListItem>

        {projectDetails?.cycle_view && (
          <SidebarPropertyListItem compact label={t("common.cycle")}>
            <IssueCycleSelect
              className="h-7.5 w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
        )}

        {/* The peek shows the due date only (5A); the start date is on the item's page */}
        <SidebarPropertyListItem compact label={t("common.order_by.due_date")}>
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
            disabled={disabled}
            clearable
            className={cn("w-auto", {
              "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
            })}
            weekStartsOn={userProfile?.start_of_the_week}
            variant="select-ghost-md"
            formatToken="MMM d"
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem compact label={t("common.parent")}>
          <IssueParentSelectRoot
            className="h-7.5 w-full grow"
            disabled={disabled}
            issueId={issueId}
            issueOperations={issueOperations}
            projectId={projectId}
            workspaceSlug={workspaceSlug}
          />
        </SidebarPropertyListItem>

        {isEstimateEnabled && (
          <SidebarPropertyListItem compact label={t("common.estimate")}>
            <EstimateSelect
              value={issue?.estimate_point ?? undefined}
              onChange={(val: string | null) =>
                issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
              }
              projectId={projectId}
              disabled={disabled}
              variant="select-ghost-md"
              placeholder={t("common.none")}
              tooltip
            />
          </SidebarPropertyListItem>
        )}

        {projectDetails?.module_view && (
          <SidebarPropertyListItem compact label={t("common.module")}>
            <IssueModuleSelect
              className="w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
        )}
      </div>
    </section>
  );
});
