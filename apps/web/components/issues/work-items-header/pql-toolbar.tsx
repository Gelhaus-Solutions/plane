/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
// hooks
import { useIssues } from "@/hooks/store/use-issues";

type TMode = "filters" | "pql";

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** The Display menu and anything else at the end of the row */
  trailing?: ReactNode;
};

/**
 * The toolbar under a work item list's header (2A, 8B): Filters or PQL, the query, and the display options. The rich
 * filters and the PQL query both apply and combine with AND; the switch only picks which editor shows (D42). The
 * query lives in the address (?pql=) and in the user's project properties.
 */
export const WorkItemsPQLToolbar = observer(function WorkItemsPQLToolbar(props: Props) {
  const { workspaceSlug, projectId, trailing } = props;
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  // store hooks
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  // derived values
  const filters = issuesFilter.getIssueFilters(projectId);
  const applied = filters?.pql ?? "";
  const error = issuesFilter.getPQLError(projectId);
  // states
  const [mode, setMode] = useState<TMode>(applied ? "pql" : "filters");
  const [draft, setDraft] = useState(applied);
  const inputRef = useRef<HTMLInputElement>(null);

  // While a query is refused the field keeps it, with its error, and the list shows the last query that worked
  useEffect(() => setDraft(error?.query ?? applied), [applied, error]);

  // A list that opens with a query opens in PQL
  const loaded = !!filters;
  useEffect(() => {
    if (loaded && applied) setMode("pql");
    // only when the filters arrive, not on every query change
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // The address follows the applied query, so a filtered list is a link
  const urlQuery = searchParams.get("pql") ?? "";
  useEffect(() => {
    // until the filters have loaded, the address is what they read the query from
    if (!filters || urlQuery === applied) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (applied) next.set("pql", applied);
        else next.delete("pql");
        return next;
      },
      { replace: true }
    );
  }, [filters, applied, urlQuery, setSearchParams]);

  // "/" focuses the query, unless a field or a dialog has the keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingInInput(e.target) || document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
      e.preventDefault();
      setMode("pql");
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const apply = () => {
    if (draft.trim() === applied && !error) return;
    if (error && draft.trim() === error.query) return;
    void issuesFilter.updatePQL(workspaceSlug, projectId, draft);
  };

  return (
    <div className="flex flex-col border-b border-strong">
      <div className="flex flex-wrap items-center gap-2 px-[18px] py-2">
        <div role="group" className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-layer-2 p-0.5 text-12">
          {(["filters", "pql"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "flex h-6 items-center rounded-md px-2.5 text-secondary transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
                { "bg-surface-1 font-semibold text-primary shadow-e1 ring-1 ring-(--border-strong)": mode === option }
              )}
            >
              {option === "filters" ? t("common.filters") : "PQL"}
            </button>
          ))}
        </div>
        {mode === "pql" ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              } else if (e.key === "Escape") {
                e.preventDefault();
                issuesFilter.setPQLError(projectId, undefined);
                setDraft(applied);
                e.currentTarget.blur();
              }
            }}
            spellCheck={false}
            aria-label={t("work_items_header.query_label")}
            aria-invalid={!!error}
            placeholder={t("work_items_header.query_placeholder")}
            className={cn(
              "h-[30px] min-w-0 flex-[1_1_320px] rounded-lg border border-strong bg-surface-2 px-2.5 font-code text-[12.5px] text-primary placeholder-(--text-color-placeholder) outline-none focus:border-accent-strong",
              { "border-danger-strong focus:border-danger-strong": !!error }
            )}
          />
        ) : (
          <div className="flex min-w-0 flex-[1_1_320px] items-center gap-2">
            <WorkItemFiltersToggle entityType={EIssuesStoreType.PROJECT} entityId={projectId} />
            {applied && (
              <button
                type="button"
                onClick={() => setMode("pql")}
                className="min-w-0 truncate rounded-md bg-layer-2 px-2 py-0.5 font-code text-12 text-secondary hover:text-primary"
              >
                {applied}
              </button>
            )}
          </div>
        )}
        {trailing}
      </div>
      {error && (
        <p role="alert" className="px-[18px] pb-2 text-12 text-danger-primary">
          {error.position !== undefined
            ? t("work_items_header.query_error_at", { message: error.message, position: error.position + 1 })
            : error.message}
        </p>
      )}
    </div>
  );
});
