/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Command } from "cmdk";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ISSUE_PRIORITIES } from "@plane/constants";
import { PriorityIcon, PriorityRowIcon } from "@plane/blocks/icons";
import { workspacePriorityLabel } from "@plane/blocks/property-select";
import { useTranslation } from "@plane/i18n";
import type { TIssue, TIssuePriorities } from "@plane/types";
// hooks
import { usePriority } from "@/hooks/store/use-priority";
// local imports
import { PowerKModalCommandItem } from "../../../modal/command-item";

/** A priority picked in Power K: its level, and the custom priority (E35), `null` for a built-in one. */
export type TPowerKPriorityPick = { priority: TIssuePriorities; optionId: string | null };

type Props = {
  handleSelect: (pick: TPowerKPriorityPick) => void;
  workItemDetails: TIssue;
};

export const PowerKWorkItemPrioritiesMenu = observer(function PowerKWorkItemPrioritiesMenu(props: Props) {
  const { handleSelect, workItemDetails } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { getPriorities, fetchPriorities } = usePriority();
  const priorities = slug ? getPriorities(slug) : undefined;

  useEffect(() => {
    if (slug && !priorities) void fetchPriorities(slug).catch(() => undefined);
  }, [slug, priorities, fetchPriorities]);

  if (!priorities?.length)
    return (
      <Command.Group>
        {ISSUE_PRIORITIES.map((priority) => (
          <PowerKModalCommandItem
            key={priority.key}
            iconNode={<PriorityIcon priority={priority.key} />}
            label={priority.title}
            isSelected={priority.key === workItemDetails.priority}
            onSelect={() => handleSelect({ priority: priority.key, optionId: null })}
          />
        ))}
      </Command.Group>
    );

  // grouped by level, the workspace's own under theirs (r15-01)
  const named = workItemDetails.priority_option_id ?? null;
  return (
    <>
      {ISSUE_PRIORITIES.map((level) => (
        <Command.Group key={level.key} heading={t(level.key) || level.title}>
          {priorities
            .filter((priority) => priority.level === level.key)
            .map((priority) => (
              <PowerKModalCommandItem
                key={priority.id}
                iconNode={<PriorityRowIcon priority={priority} />}
                label={workspacePriorityLabel(t, priority)}
                isSelected={
                  named ? priority.id === named : priority.is_builtin && priority.level === workItemDetails.priority
                }
                onSelect={() =>
                  handleSelect({ priority: priority.level, optionId: priority.is_builtin ? null : priority.id })
                }
              />
            ))}
        </Command.Group>
      ))}
    </>
  );
});
