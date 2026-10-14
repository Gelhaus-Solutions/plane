/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TEpicHealth } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useEpic } from "@/hooks/store/use-epic";
// local imports
import { EpicHealthChip } from "../parts";

const HEALTHS: TEpicHealth[] = ["on_track", "at_risk", "off_track"];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  epicId: string;
  initialHealth: TEpicHealth | null;
};

/** Post a status update: the epic's health and a short note. The newest update is the epic's health. */
export const EpicUpdateModal = observer(function EpicUpdateModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, epicId, initialHealth } = props;
  const { t } = useTranslation();
  const { postUpdate } = useEpic();
  const [health, setHealth] = useState<TEpicHealth>("on_track");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setHealth(initialHealth ?? "on_track");
    setBody("");
  }, [isOpen, initialHealth]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await postUpdate(workspaceSlug, projectId, epicId, { health, body: body.trim() });
      setToast({ type: "success", title: t("epics.update_modal.posted"), compact: true });
      onClose();
    } catch {
      setToast({ type: "error", title: t("epics.update_modal.failed") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="sm">
        <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{t("epics.update_modal.title")}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <div role="radiogroup" aria-label={t("epics.update_modal.health")} className="flex flex-wrap gap-1.5">
                  {HEALTHS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={health === option}
                      onClick={() => setHealth(option)}
                      className={cn(
                        "rounded-[12px] p-0.5 opacity-60 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-strong",
                        { "bg-layer-2 opacity-100": health === option }
                      )}
                    >
                      <EpicHealthChip health={option} />
                    </button>
                  ))}
                </div>
                <textarea
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={4000}
                  rows={4}
                  aria-label={t("epics.update_modal.body_placeholder")}
                  placeholder={t("epics.update_modal.body_placeholder")}
                  className="w-full resize-none rounded-lg border border-strong bg-surface-2 px-2.5 py-2 text-13 leading-[1.5] text-primary placeholder-(--text-color-placeholder) outline-none focus:border-accent-strong"
                />
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" onClick={onClose} label={t("cancel")} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              loading={isSubmitting}
              label={t("epics.update_modal.post")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
