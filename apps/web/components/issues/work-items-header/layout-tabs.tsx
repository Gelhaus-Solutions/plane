/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { AddOutline } from "@makeplane/propel/icons";
// plane imports
import { ISSUE_LAYOUT_MAP } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EIssueLayoutTypes } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";

// The order of the frames: list, board, calendar, timeline, spreadsheet
const LAYOUT_ORDER = [
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
  EIssueLayoutTypes.GANTT,
  EIssueLayoutTypes.SPREADSHEET,
];

const TAB =
  "relative flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-13 font-medium whitespace-nowrap text-secondary transition-colors duration-[120ms] outline-none hover:text-primary focus-visible:text-primary";

type Props = {
  activeLayout: EIssueLayoutTypes | undefined;
  onChange: (layout: EIssueLayoutTypes) => void;
  /** Opens the create view modal; without it there is no View tab */
  onCreateView?: () => void;
};

/** The layouts of a work item list as underline tabs (2A), with a tab that saves the list as a view. */
export const WorkItemsLayoutTabs = observer(function WorkItemsLayoutTabs(props: Props) {
  const { activeLayout, onChange, onCreateView } = props;
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("work_items_header.layouts")}
      className="-mx-[18px] flex gap-0.5 overflow-x-auto border-b border-strong px-2.5"
    >
      {LAYOUT_ORDER.map((layout) => {
        const isActive = activeLayout === layout;
        return (
          <button
            key={layout}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => !isActive && onChange(layout)}
            className={cn(TAB, {
              "text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-[2px] after:bg-accent-primary":
                isActive,
            })}
          >
            <IssueLayoutIcon layout={layout} className="size-3.5" />
            {t(ISSUE_LAYOUT_MAP[layout].i18n_label)}
          </button>
        );
      })}
      {onCreateView && (
        <button type="button" onClick={onCreateView} className={TAB}>
          <AddOutline className="size-3.5" />
          {t("common.view")}
        </button>
      )}
    </nav>
  );
});
