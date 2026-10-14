/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowNarrowRightOutline, EditOutline } from "@makeplane/propel/icons";
// plane imports
import { StateGroupIcon } from "@plane/blocks/icons";
import { DateSelect } from "@plane/blocks/property-select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TEpicDetail, TEpicDetailFields, TIssue } from "@plane/types";
import { calculateTimeAgo, cn, generateWorkItemLink, getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { MemberSelect } from "@/components/dropdowns/member/member-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
import { IssueLabel } from "@/components/issues/issue-detail/label";
// hooks
import { useEpic } from "@/hooks/store/use-epic";
import { useMember } from "@/hooks/store/use-member";
import { useUserProfile } from "@/hooks/store/user";
// local imports
import { EpicSizeSelect, EpicWaveSelect } from "../fields";
import { EpicHealthChip, shortDate } from "../parts";
import { EpicUpdateModal } from "./update-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  epic: TEpicDetail;
  issue: TIssue | undefined;
  isEditable: boolean;
  updateIssue: (data: Partial<TIssue>) => Promise<void>;
};

/** A boxed panel of the rail (4A): a caps heading, then its content. */
function RailBox(props: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className="rounded-xl border border-strong bg-surface-1 shadow-e1">
      <h2 className="flex h-[38px] items-center gap-2 border-b border-subtle px-3 text-[10.5px] font-semibold tracking-[0.08em] text-secondary uppercase">
        <span className="flex-1">{props.title}</span>
        {props.meta}
      </h2>
      <div className={props.className ?? "px-3 pt-2.5 pb-3"}>{props.children}</div>
    </section>
  );
}

/** The epic's rail (r4-12): its properties, the latest status update and what it needs. */
export const EpicRail = observer(function EpicRail(props: Props) {
  const { workspaceSlug, projectId, epic, issue, isEditable, updateIssue } = props;
  const { t } = useTranslation();
  const { updateEpicFields } = useEpic();
  const { getUserDetails } = useMember();
  const { data: userProfile } = useUserProfile();
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);

  const setField = (data: TEpicDetailFields) =>
    void updateEpicFields(workspaceSlug, projectId, epic.id, data).catch(() =>
      setToast({ type: "error", title: t("epics.update_failed") })
    );
  const setIssue = (data: Partial<TIssue>) =>
    void updateIssue(data).catch(() => setToast({ type: "error", title: t("epics.update_failed") }));

  const update = epic.latest_update;
  const author = update?.created_by ? getUserDetails(update.created_by) : undefined;
  const startDate = issue?.start_date ?? epic.start_date;
  const targetDate = issue?.target_date ?? epic.target_date;

  return (
    <aside
      aria-label={t("work_item_detail.properties")}
      className="flex w-[330px] max-w-[330px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-strong p-3.5"
    >
      <EpicUpdateModal
        isOpen={isUpdateOpen}
        onClose={() => setIsUpdateOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        epicId={epic.id}
        initialHealth={epic.health}
      />
      <RailBox
        title={t("work_item_detail.properties")}
        className={cn("px-3 pt-1.5 pb-2.5", { "opacity-60": !isEditable })}
      >
        <SidebarPropertyListItem label={t("common.state")}>
          <StateSelect
            value={issue?.state_id ?? epic.state_id}
            onChange={(stateId) => setIssue({ state_id: stateId })}
            projectId={projectId}
            disabled={!isEditable}
            variant="select-ghost-md"
          />
        </SidebarPropertyListItem>
        <SidebarPropertyListItem label={t("epics.detail.lead")}>
          <MemberSelect
            value={epic.lead_id}
            onChange={(id) => setField({ lead_id: id === epic.lead_id ? null : id || null })}
            projectId={projectId}
            placeholder={t("epics.no_lead")}
            disabled={!isEditable}
            variant="select-ghost-md"
            showLabel
          />
        </SidebarPropertyListItem>
        <SidebarPropertyListItem label={t("epics.detail.wave")}>
          <EpicWaveSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            value={epic.wave_id}
            onChange={(waveId) => setField({ wave_id: waveId })}
            disabled={!isEditable}
            variant="select-ghost-md"
          />
        </SidebarPropertyListItem>
        <SidebarPropertyListItem label={t("epics.detail.size")}>
          <EpicSizeSelect
            value={epic.size}
            onChange={(size) => setField({ size })}
            disabled={!isEditable}
            variant="select-ghost-md"
          />
        </SidebarPropertyListItem>
        <SidebarPropertyListItem label={t("work_item_detail.dates")} childrenClassName="gap-0.5 flex-nowrap">
          <DateSelect
            placeholder={t("common.order_by.start_date")}
            value={getDate(startDate) ?? null}
            onChange={(date) => setIssue({ start_date: date ? (renderFormattedPayloadDate(date) ?? null) : null })}
            maxDate={getDate(targetDate) ?? undefined}
            disabled={!isEditable}
            clearable
            weekStartsOn={userProfile?.start_of_the_week}
            variant="select-ghost-md"
            formatToken="MMM d"
            className="w-auto"
          />
          <ArrowNarrowRightOutline className="size-3 shrink-0 text-tertiary" aria-hidden="true" />
          <DateSelect
            placeholder={t("epics.columns.target")}
            value={getDate(targetDate) ?? null}
            onChange={(date) => setIssue({ target_date: date ? (renderFormattedPayloadDate(date) ?? null) : null })}
            minDate={getDate(startDate) ?? undefined}
            disabled={!isEditable}
            clearable
            weekStartsOn={userProfile?.start_of_the_week}
            variant="select-ghost-md"
            formatToken="MMM d"
            className="w-auto"
          />
        </SidebarPropertyListItem>
        {issue && (
          <SidebarPropertyListItem label={t("common.labels")}>
            <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={epic.id} disabled={!isEditable} />
          </SidebarPropertyListItem>
        )}
      </RailBox>

      <RailBox title={t("epics.detail.status_update")}>
        <div className="flex flex-col gap-2">
          {update ? (
            <>
              <div className="flex items-center gap-2">
                <EpicHealthChip health={update.health} />
                <span className="text-12 text-tertiary">
                  {[author?.display_name, calculateTimeAgo(update.created_at)].filter(Boolean).join(", ")}
                </span>
              </div>
              {update.body && <p className="text-[12.5px] leading-normal text-secondary">{update.body}</p>}
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              {epic.health && <EpicHealthChip health={epic.health} className="self-start" />}
              <p className="text-[12.5px] leading-normal text-secondary">
                {epic.health_source === "pace"
                  ? epic.projected_date
                    ? t("epics.health.from_pace_date", { date: shortDate(epic.projected_date) })
                    : t("epics.health.from_pace")
                  : t("epics.detail.no_update")}
              </p>
            </div>
          )}
          {isEditable && (
            <button
              type="button"
              onClick={() => setIsUpdateOpen(true)}
              className="flex h-6 items-center gap-1.5 self-start rounded-[7px] border border-strong bg-layer-1 px-2 text-12 font-medium text-primary shadow-e1 hover:bg-layer-1-hover"
            >
              <EditOutline className="size-3" />
              {t("epics.detail.post_update")}
            </button>
          )}
        </div>
      </RailBox>

      {epic.needs.length > 0 && (
        <RailBox
          title={t("epics.detail.needs")}
          meta={
            <span className="tracking-normal rounded-[5px] bg-layer-2 px-[5px] text-11 leading-4 text-secondary">
              {epic.needs.length}
            </span>
          }
          className="px-3 pt-1.5 pb-2"
        >
          {epic.needs.map((need) => (
            <Link
              key={need.id}
              href={generateWorkItemLink({
                workspaceSlug,
                projectId: need.project_id,
                issueId: need.id,
                projectIdentifier: need.project_identifier,
                sequenceId: need.sequence_id,
              })}
              className="flex h-7 items-center gap-2 text-[12.5px] hover:text-primary"
            >
              <StateGroupIcon stateGroup={need.state_group ?? "backlog"} review={need.is_review} size="sm" />
              <span className="shrink-0 font-code text-[11.5px] text-secondary">
                {need.project_identifier}-{need.sequence_id}
              </span>
              <span className="min-w-0 truncate text-primary">{need.name}</span>
              <span className="flex-1" />
              <span className="shrink-0 text-[11.5px] text-tertiary">{need.state_name}</span>
            </Link>
          ))}
        </RailBox>
      )}
    </aside>
  );
});
