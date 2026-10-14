/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import { Avatar } from "@makeplane/propel/components/avatar";
import type { TIssueComment } from "@plane/types";
import { getFileURL } from "@plane/utils";

type TCommentBlock = {
  comment: TIssueComment;
  /** Kept for callers; the comment no longer draws a timeline */
  ends: "top" | "bottom" | undefined;
  children: ReactNode;
};

/** A comment in the activity (4A): the author's avatar, then the comment in a bordered bubble. */
export const CommentBlock = observer(function CommentBlock(props: TCommentBlock) {
  const { comment, children } = props;

  if (!comment) return null;
  const author = comment.actor_detail;
  return (
    <div id={comment.id} className="flex gap-2.5">
      <Avatar
        size="sm"
        alt={author?.display_name}
        fallback={author?.display_name?.[0]?.toUpperCase()}
        src={author?.avatar_url ? getFileURL(author.avatar_url) : undefined}
      />
      <div className="min-w-0 flex-1 rounded-[10px] border border-strong bg-surface-2 px-3 py-[9px] text-[13.5px] leading-[1.55]">
        {children}
      </div>
    </div>
  );
});
