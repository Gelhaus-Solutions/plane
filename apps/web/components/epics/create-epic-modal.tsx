/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
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
import { CalendarOutline } from "@makeplane/propel/icons";
// plane imports
import { DateSelect } from "@plane/blocks/property-select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TEpicSize } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
// hooks
import { useEpic } from "@/hooks/store/use-epic";
import { useUser, useUserProfile } from "@/hooks/store/user";
// local imports
import { EpicSizeSelect, EpicWaveSelect } from "./fields";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  defaultWaveId?: string;
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The description as paragraphs, one per line of the plain text. */
export const toDescriptionHtml = (text: string) =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("") || "<p></p>";

/** A new epic: its name and goal, then lead, wave, size and target date. The lead starts as you. */
export const CreateEpicModal = observer(function CreateEpicModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, defaultWaveId } = props;
  const { t } = useTranslation();
  const router = useRouter();
  const { createEpic } = useEpic();
  const { data: currentUser } = useUser();
  const { data: userProfile } = useUserProfile();
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [waveId, setWaveId] = useState<string | null>(null);
  const [size, setSize] = useState<TEpicSize | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setLeadId(currentUser?.id ?? null);
    setWaveId(defaultWaveId ?? null);
    setSize(null);
    setTargetDate(null);
    setShowError(false);
  }, [isOpen, currentUser?.id, defaultWaveId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setShowError(true);
      return;
    }
    setIsSubmitting(true);
    try {
      const epic = await createEpic(workspaceSlug, projectId, {
        name: name.trim(),
        description_html: toDescriptionHtml(description),
        target_date: targetDate,
        lead_id: leadId,
        wave_id: waveId,
        size,
      });
      setToast({
        type: "success",
        title: t("epics.create.created"),
      });
      onClose();
      router.push(`/${workspaceSlug}/projects/${projectId}/epics/${epic.id}`);
    } catch {
      setToast({ type: "error", title: t("epics.create.failed") });
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
      <DialogContent size="md">
        <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{t("epics.create.title")}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <input
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setShowError(false);
                  }}
                  aria-label={t("epics.create.name_placeholder")}
                  aria-invalid={showError}
                  placeholder={t("epics.create.name_placeholder")}
                  className="w-full bg-transparent text-17 leading-[1.3] font-semibold text-primary placeholder-(--text-color-placeholder) outline-none"
                />
                {showError && <p className="text-12 text-danger-primary">{t("epics.create.name_required")}</p>}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-label={t("epics.create.description_placeholder")}
                  placeholder={t("epics.create.description_placeholder")}
                  rows={3}
                  className="w-full resize-none bg-transparent text-14 leading-[1.62] text-primary placeholder-(--text-color-placeholder) outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <MemberSelect
                    value={leadId}
                    onChange={(id) => setLeadId(id === leadId ? null : id || null)}
                    projectId={projectId}
                    placeholder={t("epics.detail.lead")}
                    variant="pill-md"
                  />
                  <EpicWaveSelect
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    value={waveId}
                    onChange={setWaveId}
                    variant="pill-md"
                  />
                  <EpicSizeSelect value={size} onChange={setSize} variant="pill-md" />
                  <DateSelect
                    value={getDate(targetDate) ?? null}
                    onChange={(date) => setTargetDate(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
                    placeholder={t("epics.columns.target")}
                    icon={<CalendarOutline />}
                    weekStartsOn={userProfile?.start_of_the_week}
                    clearable
                    variant="pill-md"
                  />
                </div>
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
              label={isSubmitting ? t("epics.create.creating") : t("epics.create.create")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
