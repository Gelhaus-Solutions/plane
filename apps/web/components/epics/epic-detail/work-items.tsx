/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { AddOutline, CheckSquareOutline } from "@makeplane/propel/icons";
// plane imports
import { PriorityIcon, StateGroupIcon } from "@plane/blocks/icons";
import { StateLozenge } from "@plane/blocks/state-lozenge";
import { useTranslation } from "@plane/i18n";
import type { IState, TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { generateWorkItemLink } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { DetailSection } from "@/components/issues/issue-detail-widgets/section";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";

type Props = {
  workspaceSlug: string;
  projectId: string;
  epicId: string;
  reviewStateIds: string[];
  disabled: boolean;
  onChange: () => void;
};

/** The epic's work items, grouped by state in workflow order; finished ones fold away (r4-12). */
export const EpicWorkItems = observer(function EpicWorkItems(props: Props) {
  const { workspaceSlug, projectId, epicId, reviewStateIds, disabled, onChange } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
    subIssues: { subIssuesByIssueId, fetchSubIssues },
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { getStateById } = useProjectState();
  // states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void fetchSubIssues(workspaceSlug, projectId, epicId);
  }, [workspaceSlug, projectId, epicId, fetchSubIssues]);

  // "C" adds a work item to the epic, unless a field or a dialog has the keys
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingInInput(event.target) || document.querySelector("[role=dialog], [role=menu], [role=listbox]")) return;
      event.preventDefault();
      event.stopPropagation();
      setIsCreateOpen(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [disabled]);

  const childIds = subIssuesByIssueId(epicId);
  const groups = useMemo(() => {
    const byState = new Map<string, { state: IState | undefined; items: TIssue[] }>();
    for (const id of childIds ?? []) {
      const item = getIssueById(id);
      if (!item) continue;
      const key = item.state_id ?? "none";
      const entry = byState.get(key) ?? { state: item.state_id ? getStateById(item.state_id) : undefined, items: [] };
      entry.items.push(item);
      byState.set(key, entry);
    }
    return (
      [...byState.entries()]
        .map(([id, entry]) => ({ id, state: entry.state, items: entry.items }))
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort((a, b) => (a.state?.sequence ?? 0) - (b.state?.sequence ?? 0))
    );
  }, [childIds, getIssueById, getStateById]);

  const identifier = getProjectById(projectId)?.identifier ?? "";
  const total = childIds?.length ?? 0;

  return (
    <>
      <CreateUpdateIssueModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        data={{ project_id: projectId, parent_id: epicId }}
        storeType={EIssuesStoreType.PROJECT}
        onSubmit={async () => {
          await fetchSubIssues(workspaceSlug, projectId, epicId);
          onChange();
        }}
      />
      <DetailSection
        icon={<CheckSquareOutline />}
        label={t("epics.detail.work_items")}
        count={total}
        right={
          !disabled && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="flex h-6 items-center gap-1.5 rounded-[7px] px-2 text-12 text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <AddOutline className="size-3.5" />
              {t("epics.detail.add")}
              <kbd className="rounded bg-layer-3 px-1 font-code text-[10.5px] leading-4 text-secondary">C</kbd>
            </button>
          )
        }
      >
        {total === 0 ? (
          <p className="px-2.5 py-3 text-13 text-secondary">{t("epics.detail.no_items")}</p>
        ) : (
          groups.map((group) => {
            const isReview = reviewStateIds.includes(group.id);
            const stateGroup = group.state?.group ?? "backlog";
            const folds = stateGroup === "completed" || stateGroup === "cancelled";
            const isShown = !folds || !!shown[group.id];
            return (
              <div key={group.id}>
                <div className="flex h-[30px] items-center gap-2 border-b border-subtle bg-surface-2 px-2.5 last:border-b-0">
                  <StateLozenge kind={isReview ? "review" : stateGroup}>{group.state?.name ?? ""}</StateLozenge>
                  <span className="text-12 text-secondary tabular-nums">{group.items.length}</span>
                  <span className="flex-1" />
                  {folds && (
                    <button
                      type="button"
                      aria-expanded={isShown}
                      onClick={() => setShown((state) => ({ ...state, [group.id]: !isShown }))}
                      className="text-12 text-secondary hover:text-primary"
                    >
                      {isShown ? t("epics.detail.hide") : t("epics.detail.show")}
                    </button>
                  )}
                </div>
                {isShown &&
                  group.items.map((item) => (
                    <Link
                      key={item.id}
                      href={generateWorkItemLink({
                        workspaceSlug,
                        projectId: item.project_id,
                        issueId: item.id,
                        projectIdentifier: identifier,
                        sequenceId: item.sequence_id,
                        isEpic: item.is_epic,
                      })}
                      className="flex h-[34px] items-center gap-[9px] border-b border-subtle px-2.5 text-13 transition-colors duration-[120ms] hover:bg-layer-1-hover"
                    >
                      <StateGroupIcon stateGroup={stateGroup} review={isReview} size="md" />
                      <span className="w-[70px] shrink-0 font-code text-[11.5px] text-secondary">
                        {identifier}-{item.sequence_id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-primary">{item.name}</span>
                      <PriorityIcon priority={item.priority ?? "none"} className="size-[13px] shrink-0" />
                      <span className="flex w-[18px] shrink-0 justify-end">
                        {item.assignee_ids?.length ? (
                          <ButtonAvatars showTooltip={false} userIds={item.assignee_ids[0]} />
                        ) : (
                          <span className="size-[18px] rounded-full border border-dashed border-strong" />
                        )}
                      </span>
                    </Link>
                  ))}
              </div>
            );
          })
        )}
      </DetailSection>
    </>
  );
});
