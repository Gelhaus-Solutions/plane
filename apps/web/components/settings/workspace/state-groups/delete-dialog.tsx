/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { ArrowNarrowRightOutline } from "@makeplane/propel/icons";
// plane imports
import { WorkspaceStateGroupIcon } from "@plane/blocks/icons";
import { ProjectBadge } from "@plane/blocks/project-badge";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TStateGroupState, TWorkspaceStateGroup } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useStateGroup } from "@/hooks/store/use-state-group";

const K = "workspace_settings.settings.state_groups.delete_dialog";

type Props = {
  workspaceSlug: string;
  group: TWorkspaceStateGroup;
  groups: TWorkspaceStateGroup[];
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * Deleting a custom state group (r9-17): each of its states, project by project, gets the group it moves to, the
 * built-in group of the same category to start with. Then the states move and the group goes; no item loses its state.
 */
export const StateGroupDeleteDialog = observer(function StateGroupDeleteDialog(props: Props) {
  const { workspaceSlug, group, groups, onClose, onDeleted } = props;
  const { t } = useTranslation();
  const { fetchStateGroupStates, deleteStateGroup } = useStateGroup();
  const { getProjectById } = useProject();
  const [states, setStates] = useState<TStateGroupState[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const targets = groups.filter((other) => other.id !== group.id);
  const fallbackId = (
    targets.find((other) => other.is_builtin && other.key === group.category) ??
    targets.find((other) => other.category === group.category) ??
    targets[0]
  )?.id;

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchStateGroupStates(workspaceSlug, group.id);
        setStates(list);
        setMoves(Object.fromEntries(list.map((state) => [state.id, fallbackId ?? ""])));
      } catch {
        setFailed(true);
      }
    };
    void load();
  }, [fetchStateGroupStates, workspaceSlug, group.id, fallbackId]);

  // the states project by project, in the order the server lists them
  const projects: { id: string; name: string; states: TStateGroupState[] }[] = [];
  for (const state of states ?? []) {
    const project = projects.find((entry) => entry.id === state.project.id);
    if (project) project.states.push(state);
    else projects.push({ id: state.project.id, name: state.project.name, states: [state] });
  }

  const count = states?.length ?? 0;
  const ready = !!states && states.every((state) => !!moves[state.id]);

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      await deleteStateGroup(workspaceSlug, group.id, moves);
      setToast({ type: "success", title: t("workspace_settings.settings.state_groups.deleted") });
      onDeleted();
    } catch {
      setToast({ type: "error", title: t(`${K}.failed`) });
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent
        size="sm"
        data-prevent-outside-click
        onKeyDown={(event) => {
          // ⌘↵ moves the states and deletes, as the frame's button shows
          if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          void submit();
        }}
      >
        <DialogMain>
          <DialogHeader>
            <DialogHeading>
              <DialogTitle>{t(`${K}.title`, { name: group.name })}</DialogTitle>
              <DialogDescription>{t(`${K}.description`)}</DialogDescription>
            </DialogHeading>
          </DialogHeader>
          <DialogBody tabIndex={0}>
            {failed ? (
              <p className="text-13 text-secondary">{t(`${K}.load_failed`)}</p>
            ) : !states ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((index) => (
                  <div key={index} className="h-11 animate-pulse rounded-lg bg-layer-2" />
                ))}
              </div>
            ) : count === 0 ? (
              <p className="text-13 text-secondary">{t(`${K}.unused`)}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {projects.map((project) => {
                  const details = getProjectById(project.id);
                  return (
                    <div key={project.id} className="flex flex-col">
                      <span className="text-12 font-medium text-secondary">
                        {t(`${K}.project_uses`, { project: project.name, count: project.states.length })}
                      </span>
                      {project.states.map((state) => {
                        const target = targets.find((other) => other.id === moves[state.id]) ?? null;
                        return (
                          <div
                            key={state.id}
                            className="grid min-h-11 grid-cols-[minmax(0,1fr)_20px_180px] items-center gap-2.5 border-b border-subtle py-1.5 text-13"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <ProjectBadge name={project.name} seed={project.id} logo={details?.logo_props} />
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate font-medium text-primary">{state.name}</span>
                                <span className="text-11 text-tertiary">
                                  {t(`${K}.items`, { count: state.issue_count })}
                                </span>
                              </span>
                            </span>
                            <ArrowNarrowRightOutline className="size-3.5 text-tertiary" aria-hidden="true" />
                            <Select<TWorkspaceStateGroup>
                              getValues={() => targets}
                              value={target}
                              onChange={(id) => setMoves((current) => ({ ...current, [state.id]: id }))}
                              getOptionValue={(option) => option.id}
                              getOptionLabel={(option) => option.name}
                              getOptionIcon={(option) => (
                                <WorkspaceStateGroupIcon group={option} className="size-3.5" />
                              )}
                              showSearch={false}
                              pinSelected={false}
                            >
                              <Select.Trigger
                                variant="select-md"
                                aria-label={t(`${K}.move_to`, { state: state.name })}
                                className="h-[30px] w-full border border-strong bg-layer-1 shadow-e1"
                              >
                                <span className="flex min-w-0 items-center gap-1.5 text-primary">
                                  <WorkspaceStateGroupIcon group={target} className="size-3.5" />
                                  <span className="truncate">{target?.name}</span>
                                </span>
                              </Select.Trigger>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <p className="text-12 leading-relaxed text-tertiary">{t(`${K}.footnote`, { name: group.name })}</p>
              </div>
            )}
          </DialogBody>
        </DialogMain>
        <DialogActions>
          <Button
            variant="secondary"
            size="sm"
            stretch="auto"
            label={t(`${K}.cancel`)}
            disabled={submitting}
            onClick={onClose}
          />
          <Button
            variant="danger"
            size="sm"
            stretch="auto"
            label={t(`${K}.submit`, { count })}
            disabled={!ready || failed}
            loading={submitting}
            onClick={() => void submit()}
          />
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
});
