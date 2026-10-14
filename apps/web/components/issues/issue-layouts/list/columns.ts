/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueDisplayProperties } from "@plane/types";

export type TListColumns = {
  /** CSS grid template shared by the column header and every row */
  template: string;
  priority: boolean;
  id: boolean;
  labels: boolean;
  assignee: boolean;
  due: boolean;
};

/**
 * The list's columns (2A): select, priority, ID, title, labels, assignee, due; the optional ones follow the display
 * properties, so the header and the rows always line up.
 */
export const getListColumns = (displayProperties: IIssueDisplayProperties | undefined): TListColumns => {
  const on = (key: keyof IIssueDisplayProperties) => displayProperties?.[key] ?? true;
  const columns = {
    priority: on("priority"),
    id: on("key"),
    labels: on("labels"),
    assignee: on("assignee"),
    due: on("due_date"),
  };
  const template = [
    "18px",
    columns.priority && "16px",
    columns.id && "74px",
    "minmax(0,1fr)",
    columns.labels && "128px",
    columns.assignee && "150px",
    columns.due && "60px",
  ]
    .filter(Boolean)
    .join(" ");
  return { template, ...columns };
};
