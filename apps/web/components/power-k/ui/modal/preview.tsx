/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { PriorityIcon, StateGroupIcon } from "@plane/blocks/icons";
import type { IWorkspaceIssueSearchResult, IWorkspaceSearchResults, TIssue } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { IssueService } from "@/services/issue";
// local imports
import { PowerKHighlight } from "./highlight";
import { POWER_K_SEARCH_RESULTS_GROUPS_MAP, parsePowerKSearchResultValue } from "./search-results-map";

const issueService = new IssueService();

// Work items the preview fetched, kept while the page lives so moving back and forth asks only once
const previewCache = new Map<string, TIssue>();

const toPlainText = (html: string | undefined) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 leading-4 font-medium text-secondary">
      {children}
    </kbd>
  );
}

function ActionButton({ label, keys, onClick }: { label: string; keys: string; onClick: () => void }) {
  return (
    <button
      type="button"
      // The input keeps the focus, so the keys still drive the menu
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 w-full items-center justify-between gap-2 rounded-md border border-strong bg-layer-2 px-2.5 text-12 font-medium text-primary transition-colors duration-[120ms] hover:bg-layer-2-hover"
    >
      {label}
      <Kbd>{keys}</Kbd>
    </button>
  );
}

/** The selected work item: state, id, title, people, priority and the start of its description. */
const WorkItemPreview = observer(function WorkItemPreview(props: {
  result: IWorkspaceIssueSearchResult;
  searchTerm: string;
  onOpen: () => void;
  onPeek: () => void;
}) {
  const { result, searchTerm, onOpen, onPeek } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { platform } = usePlatformOS();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();
  const [fetched, setFetched] = useState<TIssue | undefined>(previewCache.get(result.id));

  const stored = getIssueById(result.id);
  const workItem = stored ?? fetched;
  // A list loads work items without their description, so those are fetched too
  const needsFetch = !stored || stored.description_html === undefined;

  // Fetch what the stores do not hold, a moment after the selection settles
  useEffect(() => {
    if (!needsFetch || previewCache.has(result.id) || !workspaceSlug) {
      setFetched(previewCache.get(result.id));
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      issueService
        .retrieve(workspaceSlug.toString(), result.project_id, result.id)
        .then((issue) => {
          previewCache.set(result.id, issue);
          if (!cancelled) setFetched(issue);
          return issue;
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [result.id, result.project_id, needsFetch, workspaceSlug]);

  const state = getStateById(workItem?.state_id);
  const assignees = (workItem?.assignee_ids ?? []).flatMap((id) => {
    const member = getUserDetails(id);
    return member ? [member] : [];
  });
  const description = toPlainText(stored?.description_html ?? fetched?.description_html);
  const mod = platform === "MacOS" ? "⌘" : "Ctrl";

  return (
    <>
      <div className="flex items-center gap-2">
        {state && <StateGroupIcon stateGroup={state.group} size="md" />}
        <span className="font-code text-12 text-secondary">
          {result.project__identifier}-{result.sequence_id}
        </span>
        {state && <span className="truncate text-12 text-tertiary">{state.name}</span>}
      </div>
      <div className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-primary">
        <PowerKHighlight text={workItem?.name ?? result.name} term={searchTerm} />
      </div>
      {workItem && (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map((member) => (
            <span
              key={member.id}
              className="inline-flex h-6 items-center gap-1.5 rounded-lg border border-strong bg-layer-1 px-2 text-[12.5px] text-primary"
            >
              <BotAvatar name={member.display_name} bot={member.is_bot} size={16} />
              {member.display_name}
            </span>
          ))}
          {workItem.priority && workItem.priority !== "none" && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-lg border border-strong bg-layer-1 px-2 text-[12.5px] text-primary">
              <PriorityIcon priority={workItem.priority} className="size-3" />
              {t(workItem.priority)}
            </span>
          )}
        </div>
      )}
      {description && <p className="line-clamp-6 text-13 leading-[1.55] text-secondary">{description}</p>}
      <span className="flex-1" />
      <div className="grid grid-cols-2 gap-1.5">
        <ActionButton label={t("power_k.preview.open")} keys="↵" onClick={onOpen} />
        <ActionButton label={t("power_k.preview.peek")} keys={`${mod}↵`} onClick={onPeek} />
      </div>
    </>
  );
});

type Props = {
  results: IWorkspaceSearchResults;
  selectedValue: string;
  searchTerm: string;
  onOpen: () => void;
  onPeek: () => void;
  className?: string;
};

/** The right pane of the search view: what the selected result is, before opening it. */
export const PowerKSearchPreview = observer(function PowerKSearchPreview(props: Props) {
  const { results, selectedValue, searchTerm, onOpen, onPeek, className } = props;
  const { t } = useTranslation();
  const selected = parsePowerKSearchResultValue(selectedValue);
  const item = selected ? results.results[selected.key]?.find((entry) => entry.id === selected.id) : undefined;

  return (
    <aside
      aria-label={t("power_k.preview.label")}
      className={cn("flex min-w-0 flex-col gap-3 overflow-y-auto p-4", className)}
    >
      {selected && item ? (
        selected.key === "issue" ? (
          <WorkItemPreview
            result={item as IWorkspaceIssueSearchResult}
            searchTerm={searchTerm}
            onOpen={onOpen}
            onPeek={onPeek}
          />
        ) : (
          <OtherPreview
            groupKey={selected.key}
            item={item}
            searchTerm={searchTerm}
            onOpen={onOpen}
            openLabel={t("power_k.preview.open")}
          />
        )
      ) : (
        <p className="m-auto text-center text-13 text-tertiary">{t("power_k.preview.empty")}</p>
      )}
    </aside>
  );
});

function OtherPreview(props: {
  groupKey: keyof IWorkspaceSearchResults["results"];
  item: IWorkspaceSearchResults["results"][keyof IWorkspaceSearchResults["results"]][number];
  searchTerm: string;
  onOpen: () => void;
  openLabel: string;
}) {
  const { groupKey, item, searchTerm, onOpen, openLabel } = props;
  const { t } = useTranslation();
  const group = POWER_K_SEARCH_RESULTS_GROUPS_MAP[groupKey];
  const Icon = group.icon;
  return (
    <>
      <div className="flex items-center gap-2 text-12 text-secondary">
        <Icon className="size-4 text-secondary" />
        {group.sub(item, t)}
      </div>
      <div className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-primary">
        <PowerKHighlight text={group.label(item)} term={searchTerm} />
      </div>
      <span className="flex-1" />
      <ActionButton label={openLabel} keys="↵" onClick={onOpen} />
    </>
  );
}
