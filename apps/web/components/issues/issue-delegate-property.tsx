/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { useProjectBotIds } from "@/components/agents/use-project-bots";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { AssigneeSelect } from "@/components/dropdowns/assignee/assignee-select";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  compact?: boolean;
};

/** The Delegate row under Assignee (r6-18): the agent that works for the item's assignee, who stays accountable. It
 * is only there when the project has a bot to delegate to. */
export const IssueDelegateProperty = observer(function IssueDelegateProperty(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, compact } = props;
  const { t } = useTranslation();
  const agent = useAgent();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const botIds = useProjectBotIds(projectId);
  const hasBots = botIds.length > 0;

  // the item's agents are what the assignee picker and this row show; load them once the project has bots
  useEffect(() => {
    if (!hasBots) return;
    void agent.fetchIssueAgents(workspaceSlug, projectId, issueId).catch(() => undefined);
    void agent.fetchPickableSessions(workspaceSlug).catch(() => undefined);
  }, [agent, hasBots, workspaceSlug, projectId, issueId]);

  if (!hasBots) return null;
  return (
    <SidebarPropertyListItem compact={compact} label={t("agents.delegate")}>
      <AssigneeSelect
        mode="delegate"
        testId="work-item-delegate-select"
        projectId={projectId}
        issueId={issueId}
        value={getIssueById(issueId)?.assignee_ids ?? []}
        disabled={disabled}
        placeholder={t("common.none")}
        variant="select-ghost-md"
        tooltip={{ heading: t("agents.delegate") }}
      />
    </SidebarPropertyListItem>
  );
});
