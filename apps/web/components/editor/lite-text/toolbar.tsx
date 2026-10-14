/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import type { LucideIcon } from "lucide-react";

import { EIssueCommentAccessSpecifier } from "@plane/constants";
// editor
import type { EditorRefApi } from "@plane/editor";
// i18n
import { useTranslation } from "@plane/i18n";
// ui
import { Button } from "@makeplane/propel/elements/button";
import { AtOutline, AttachOutline, GlobeOutline, LockOutline } from "@makeplane/propel/icons";
import type { ISvgIcons } from "@plane/blocks/icons";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// constants
import { cn } from "@plane/utils";
import type { ToolbarMenuItem } from "@plane/editor";
import { TOOLBAR_ITEMS } from "@plane/editor";
// helpers

type Props = {
  accessSpecifier?: EIssueCommentAccessSpecifier;
  executeCommand: (item: ToolbarMenuItem) => void;
  handleAccessChange?: (accessKey: EIssueCommentAccessSpecifier) => void;
  handleSubmit: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  isCommentEmpty: boolean;
  isSubmitting: boolean;
  showAccessSpecifier: boolean;
  showSubmitButton: boolean;
  editorRef: EditorRefApi | null;
  submitButtonText?: string;
};

type TCommentAccessType = {
  icon: LucideIcon | React.FC<ISvgIcons>;
  key: EIssueCommentAccessSpecifier;
  label: "Private" | "Public";
};

const COMMENT_ACCESS_SPECIFIERS: TCommentAccessType[] = [
  {
    icon: LockOutline,
    key: EIssueCommentAccessSpecifier.INTERNAL,
    label: "Private",
  },
  {
    icon: GlobeOutline,
    key: EIssueCommentAccessSpecifier.EXTERNAL,
    label: "Public",
  },
];

const toolbarItems = TOOLBAR_ITEMS.lite;

export function IssueCommentToolbar(props: Props) {
  const { t } = useTranslation();
  const {
    accessSpecifier,
    executeCommand,
    handleAccessChange,
    handleSubmit,
    isCommentEmpty,
    isSubmitting,
    showAccessSpecifier,
    showSubmitButton,
    editorRef,
    submitButtonText = "common.comment",
  } = props;
  const isEditorReadyToDiscard = editorRef?.isEditorReadyToDiscard();
  const isSubmitButtonDisabled = isCommentEmpty || !isEditorReadyToDiscard;

  const imageItem = Object.values(toolbarItems)
    .flat()
    .find((item) => item.itemKey === "image");

  // The composer's foot (4A): attach and mention, the comment's visibility on public projects, then Comment
  return (
    <div className="flex w-full items-center gap-1 text-tertiary">
      {imageItem && (
        <Tooltip label={imageItem.name}>
          <button
            type="button"
            aria-label={imageItem.name}
            onClick={() => executeCommand(imageItem)}
            className="grid size-6 place-items-center rounded-[7px] transition-colors hover:bg-layer-transparent-hover hover:text-secondary"
          >
            <AttachOutline className="size-3.5" />
          </button>
        </Tooltip>
      )}
      <Tooltip label={t("work_item_detail.mention")}>
        <button
          type="button"
          aria-label={t("work_item_detail.mention")}
          onClick={() => {
            editorRef?.focus("end");
            editorRef?.insertText("@");
          }}
          className="grid size-6 place-items-center rounded-[7px] transition-colors hover:bg-layer-transparent-hover hover:text-secondary"
        >
          <AtOutline className="size-3.5" />
        </button>
      </Tooltip>
      {showAccessSpecifier && (
        <div className="ml-1 inline-flex items-center gap-0.5 rounded-md bg-layer-2 p-0.5">
          {COMMENT_ACCESS_SPECIFIERS.map((access) => {
            const isAccessActive = accessSpecifier === access.key;
            return (
              <Tooltip key={access.key} label={access.label} layout="stacked">
                <button
                  type="button"
                  aria-label={access.label}
                  aria-pressed={isAccessActive}
                  onClick={() => handleAccessChange?.(access.key)}
                  className={cn("grid size-5 place-items-center rounded-[5px] text-tertiary", {
                    "bg-surface-1 text-primary shadow-e1 ring-1 ring-(--border-strong)": isAccessActive,
                  })}
                >
                  <access.icon className="size-3" strokeWidth={2} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
      <span className="flex-1" />
      {showSubmitButton && (
        <Button
          type="submit"
          variant="primary"
          size="sm"
          stretch="auto"
          onClick={handleSubmit}
          disabled={isSubmitButtonDisabled || isSubmitting}
        >
          {t(submitButtonText)}
          <kbd className="inline-flex h-4 items-center rounded-[4px] bg-white/16 px-1 font-code text-10-5 font-medium">
            ↵
          </kbd>
        </Button>
      )}
    </div>
  );
}
