/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
// plane imports
import { Tooltip } from "@makeplane/propel/components/tooltip";
import type { EditorRefApi } from "@plane/editor";
import { useHashScroll } from "@plane/hooks";
import { GlobeOutline, LockOutline } from "@makeplane/propel/icons";
import { EIssueCommentAccessSpecifier } from "@plane/types";
import type { TCommentsOperations, TIssueComment } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { calculateTimeAgo, cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// local imports
import { CommentReactions } from "../comment-reaction";
import { CommentCardEditForm } from "./edit-form";
import { EmojiReactionButton, EmojiReactionPicker } from "@plane/blocks/emoji-reaction";
import { useMember } from "@/hooks/store/use-member";

export type TCommentCardDisplayProps = {
  activityOperations: TCommentsOperations;
  comment: TIssueComment;
  disabled: boolean;
  entityId: string;
  projectId?: string;
  readOnlyEditorRef: React.RefObject<EditorRefApi | null>;
  showAccessSpecifier: boolean;
  workspaceId: string;
  workspaceSlug: string;
  isEditing?: boolean;
  setIsEditing?: (isEditing: boolean) => void;
  renderFooter?: (ReactionsComponent: ReactNode | null) => ReactNode;
  renderQuickActions?: () => ReactNode;
};

export const CommentCardDisplay = observer(function CommentCardDisplay(props: TCommentCardDisplayProps) {
  const {
    activityOperations,
    comment,
    disabled,
    projectId,
    readOnlyEditorRef,
    showAccessSpecifier,
    workspaceId,
    workspaceSlug,
    isEditing = false,
    setIsEditing,
    renderFooter,
    renderQuickActions,
  } = props;
  const { t } = useTranslation();
  // states
  const [highlightClassName, setHighlightClassName] = useState("");
  // state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // store hooks
  const { getUserDetails } = useMember();
  // derived values
  const userDetails = getUserDetails(comment?.actor);
  const isBot = !!comment?.actor_detail?.is_bot;
  const displayName = isBot
    ? comment?.actor_detail?.first_name || comment?.actor_detail?.display_name
    : (userDetails?.display_name ?? comment?.actor_detail?.display_name);

  const userReactions = activityOperations.userReactions(comment.id);

  // navigation
  const pathname = usePathname();
  // derived values
  const commentBlockId = `comment-${comment?.id}`;
  // Check if there are any reactions to determine if we should render the footer
  const reactionIds = activityOperations.reactionIds(comment.id);
  const hasReactions = reactionIds && Object.keys(reactionIds).some((key) => reactionIds[key]?.length > 0);

  // scroll to comment
  const { isHashMatch } = useHashScroll({
    elementId: commentBlockId,
    pathname,
  });

  useEffect(() => {
    if (!isHashMatch) return;
    setHighlightClassName("border-accent-strong");
    const timeout = setTimeout(() => {
      setHighlightClassName("");
    }, 8000);

    return () => clearTimeout(timeout);
  }, [isHashMatch]);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      if (!userReactions) return;
      // emoji is already in decimal string format from EmojiReactionPicker
      void activityOperations.react(comment.id, emoji, userReactions);
    },
    [activityOperations, comment.id, userReactions]
  );

  const shouldRenderReactions = hasReactions && !disabled;

  return (
    <div id={commentBlockId} className="relative flex flex-col gap-1">
      {showAccessSpecifier && (
        <div className="absolute top-2.5 right-2.5 z-[1] text-tertiary">
          {comment.access === EIssueCommentAccessSpecifier.INTERNAL ? (
            <LockOutline className="size-3" />
          ) : (
            <GlobeOutline className="size-3" />
          )}
        </div>
      )}
      <div className="relative flex w-full items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="font-semibold text-primary">{displayName}</span>
          {isBot && (
            <span className="inline-flex h-4 items-center rounded-[5px] bg-loz-review-bg px-[5px] text-[9.5px] font-semibold tracking-[0.06em] text-loz-review-fg">
              BOT
            </span>
          )}
          <Tooltip
            label={`${renderFormattedDate(comment.created_at)}, ${renderFormattedTime(comment.created_at)}`}
            side="bottom"
            layout="single"
            delay={200}
          >
            <span className="text-tertiary">
              {calculateTimeAgo(comment.created_at)}
              {comment.edited_at && ` (${t("edited")})`}
            </span>
          </Tooltip>
        </div>
        {!disabled && (
          <div className="flex shrink-0 items-center gap-1">
            <EmojiReactionPicker
              isOpen={isPickerOpen}
              handleToggle={setIsPickerOpen}
              onChange={handleEmojiSelect}
              disabled={disabled}
              label={<EmojiReactionButton onAddReaction={() => setIsPickerOpen(true)} />}
              placement="bottom-start"
            />
            {renderQuickActions ? renderQuickActions() : null}
          </div>
        )}
      </div>
      {isEditing && setIsEditing ? (
        <CommentCardEditForm
          activityOperations={activityOperations}
          comment={comment}
          isEditing={isEditing}
          readOnlyEditorRef={readOnlyEditorRef.current}
          setIsEditing={setIsEditing}
          projectId={projectId}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      ) : (
        <>
          <LiteTextEditor
            editable={false}
            ref={readOnlyEditorRef}
            id={comment.id}
            initialValue={comment.comment_html ?? ""}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            containerClassName={cn("!p-0 transition-[border-color] duration-500", highlightClassName)}
            projectId={projectId?.toString()}
            displayConfig={{
              fontSize: "small-font",
            }}
            parentClassName="border-none"
          />
          {shouldRenderReactions &&
            (renderFooter ? (
              renderFooter(
                <CommentReactions comment={comment} disabled={disabled} activityOperations={activityOperations} />
              )
            ) : (
              <CommentReactions comment={comment} disabled={disabled} activityOperations={activityOperations} />
            ))}
        </>
      )}
    </div>
  );
});
