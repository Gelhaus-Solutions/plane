/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Command } from "cmdk";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { WorkItemsOutline } from "@makeplane/propel/icons";
import { StateGroupIcon } from "@plane/blocks/icons";
import type { IWorkspaceSearchResults } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import type { TPowerKSearchResultsKeys } from "../../core/types";
import { POWER_K_SEARCH_GROUP_ORDER } from "../../hooks/use-power-k-search";
import { PowerKModalCommandItem } from "./command-item";
import { PowerKHighlight } from "./highlight";
import { POWER_K_SEARCH_RESULTS_GROUPS_MAP, getPowerKSearchResultValue } from "./search-results-map";

/** A work item's state icon when the item is in the store, the work item glyph otherwise. */
export const PowerKWorkItemLead = observer(function PowerKWorkItemLead({ workItemId }: { workItemId: string }) {
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const state = getStateById(getIssueById(workItemId)?.state_id);
  if (!state) return <WorkItemsOutline className="size-4 shrink-0 text-secondary" />;
  return <StateGroupIcon stateGroup={state.group} size="md" className="shrink-0" />;
});

type Props = {
  closePalette: () => void;
  results: IWorkspaceSearchResults;
  /** The group the scope tabs narrowed the list to, or every group */
  scope: TPowerKSearchResultsKeys | "all";
  searchTerm: string;
};

export const PowerKModalSearchResults = observer(function PowerKModalSearchResults(props: Props) {
  const { closePalette, results, scope, searchTerm } = props;
  // router
  const router = useAppRouter();
  const { projectId: routerProjectId } = useParams();
  // i18n
  const { t } = useTranslation();
  // derived values
  const projectId = routerProjectId?.toString();
  const keys = scope === "all" ? POWER_K_SEARCH_GROUP_ORDER : [scope];

  return (
    <>
      {keys.map((key) => {
        const section = results.results[key];
        const group = POWER_K_SEARCH_RESULTS_GROUPS_MAP[key];
        if (!group || !section || section.length <= 0) return null;

        return (
          <Command.Group key={key} heading={t(group.i18n_title)}>
            {section.map((item) => {
              const label = group.label(item);
              const sub = group.sub(item, t);
              return (
                <PowerKModalCommandItem
                  key={item.id}
                  value={getPowerKSearchResultValue(key, item.id)}
                  keywords={[label, sub]}
                  label={<PowerKHighlight text={label} term={searchTerm} />}
                  sub={sub}
                  icon={key === "issue" ? undefined : group.icon}
                  iconNode={key === "issue" ? <PowerKWorkItemLead workItemId={item.id} /> : undefined}
                  onSelect={() => {
                    closePalette();
                    router.push(group.path(item, projectId));
                  }}
                />
              );
            })}
          </Command.Group>
        );
      })}
    </>
  );
});
