/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { IIssueDisplayProperties } from "@plane/types";
// local imports
import { getListColumns } from "./columns";

type Props = {
  displayProperties: IIssueDisplayProperties | undefined;
};

/** The list's column header (2A), sticky above the groups. */
export function ListColumnHeader(props: Props) {
  const { t } = useTranslation();
  const columns = getListColumns(props.displayProperties);

  return (
    <div
      role="presentation"
      className="sticky top-0 z-[3] grid h-[30px] shrink-0 items-center gap-x-2.5 border-b border-strong bg-surface-1 pr-[18px] pl-3 text-[11.5px] font-medium text-secondary"
      style={{ gridTemplateColumns: columns.template }}
    >
      <span />
      {columns.priority && <span />}
      {columns.id && <span>{t("work_items_list.id")}</span>}
      <span>{t("work_items_list.title")}</span>
      {columns.labels && <span>{t("work_items_list.labels")}</span>}
      {columns.assignee && <span>{t("work_items_list.assignee")}</span>}
      {columns.due && <span className="text-right">{t("work_items_list.due")}</span>}
    </div>
  );
}
