/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useRef } from "react";
import { observer } from "mobx-react";

import { Collapsible } from "@makeplane/propel/components/collapsible";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { AddOutline, ChevronDownOutline } from "@makeplane/propel/icons";
// plane imports
import { WorkspaceStateGroupIcon } from "@plane/blocks/icons";
import { useTranslation } from "@plane/i18n";
import type { IState, TStateOperationsCallbacks, TWorkspaceStateGroup } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { StateList, StateCreate } from "@/components/project-states";

type TGroupItem = {
  /** The workspace state group (E30); its id keys `groupedStates`. */
  group: TWorkspaceStateGroup;
  expanded: boolean;
  projectName: string;
  groupedStates: Record<string, IState[]>;
  states: IState[];
  stateOperationsCallbacks: TStateOperationsCallbacks;
  isEditable: boolean;
  groupItemClassName?: string;
  stateItemClassName?: string;
  handleGroupCollapse: () => void;
  handleExpand: () => void;
};

export const GroupItem = observer(function GroupItem(props: TGroupItem) {
  const {
    group,
    groupedStates,
    states,
    expanded,
    projectName,
    isEditable,
    stateOperationsCallbacks,
    groupItemClassName,
    stateItemClassName,
    handleExpand,
    handleGroupCollapse,
  } = props;
  // refs
  const dropElementRef = useRef<HTMLDivElement | null>(null);
  // plane hooks
  const { t } = useTranslation();
  // state
  const [createState, setCreateState] = useState(false);
  // derived values
  const currentStateExpanded = expanded;
  // a group the project has no state in: it is not used here until a state is added
  const unused = states.length === 0 && !createState;
  const shouldShowEmptyState = unused && currentStateExpanded;

  const isCreateDisabled = !isEditable || createState;

  return (
    <div
      className={cn("rounded-sm border border-subtle bg-surface-2 transition-all", groupItemClassName)}
      ref={dropElementRef}
    >
      <Collapsible
        open={currentStateExpanded}
        onOpenChange={(open) => (open ? handleExpand() : handleGroupCollapse())}
        indicator={false}
        icon={
          <Icon
            icon={
              <ChevronDownOutline
                className={cn("transition-transform", {
                  "rotate-0": currentStateExpanded,
                  "-rotate-90": !currentStateExpanded,
                })}
              />
            }
          />
        }
        trigger={
          <span className="flex w-full min-w-0 items-center gap-1">
            <WorkspaceStateGroupIcon group={group} className="size-[15px] shrink-0" />
            <span className="truncate px-1 text-14 font-medium text-secondary">{group.name}</span>
            {unused && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-md border border-strong px-1.5 text-11 text-secondary">
                {t("project_settings.states.not_used", { project: projectName })}
              </span>
            )}
          </span>
        }
        trailing={
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("common.add")}
            disabled={isCreateDisabled}
            onClick={() => {
              if (!createState) {
                handleExpand();
                setCreateState(true);
              }
            }}
            icon={
              <Icon
                icon={<AddOutline className={isCreateDisabled ? "text-placeholder" : "text-accent-primary/80"} />}
              />
            }
          />
        }
      >
        {shouldShowEmptyState && (
          <div className="px-4 py-2.5 text-12 text-tertiary">
            {group.state_count
              ? t("project_settings.states.unused_note", {
                  group: group.name,
                  projects: group.project_count ?? 0,
                  states: group.state_count,
                })
              : t("project_settings.states.unused_nowhere", { group: group.name })}{" "}
            {isEditable && t("project_settings.states.unused_add", { project: projectName })}
          </div>
        )}

        <div id="group-droppable-container">
          <StateList
            groupKey={group.id}
            review={group.key === "review"}
            groupedStates={groupedStates}
            states={states}
            disabled={!isEditable}
            stateOperationsCallbacks={stateOperationsCallbacks}
            stateItemClassName={stateItemClassName}
          />
        </div>
      </Collapsible>

      {/* Rendered outside the collapsible panel (as in legacy) so the create form, and whatever the user typed
          into it, survives collapsing the group — the panel unmounts its children when closed. */}
      {isEditable && createState && (
        <div className="mt-1">
          <StateCreate
            group={group}
            handleClose={() => setCreateState(false)}
            createStateCallback={stateOperationsCallbacks.createState}
          />
        </div>
      )}
    </div>
  );
});
