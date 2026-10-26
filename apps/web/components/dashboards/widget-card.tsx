/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuSeparator, MenuTrigger } from "@makeplane/propel/components/menu";
import {
  CodeOutline,
  CopyOutline,
  DeleteOutline,
  EditOutline,
  GripOutline,
  MoreHorizontalOutline,
} from "@makeplane/propel/icons";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import { cn, copyTextToClipboard } from "@plane/utils";
// local imports
import { PQLCode } from "./pql-code";
import type { TDashboardWidget, TWidgetData } from "./types";
import { WidgetBody } from "./widget-body";

export type TWidgetActions = {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (step: -1 | 1) => void;
  onResize: (width: number, height: number) => void;
};

type Props = {
  workspaceSlug: string;
  widget: TDashboardWidget;
  data?: TWidgetData;
  /** per day or per week, for charts over time */
  per: string;
  canEdit: boolean;
  editing: boolean;
  actions: TWidgetActions;
  /** The widget being dragged, and where a dragged one would land next to this */
  lifted?: boolean;
  drop?: "before" | "after" | null;
  style?: CSSProperties;
  onGripDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onCornerDown?: (e: ReactPointerEvent<HTMLSpanElement>) => void;
};

/** A widget on the dashboard (r5-21): title, actions on hover, what it draws and its query; dashed with a grip and a
 * corner while the dashboard is edited */
export function WidgetCard(props: Props) {
  const { workspaceSlug, widget, data, per, canEdit, editing, actions, lifted, drop, style } = props;
  const { onGripDown, onCornerDown } = props;
  const { t } = useTranslation();
  const showQuery = widget.config.show_query !== false && !!widget.pql.trim();

  let sub = "";
  if (data && !data.error) {
    // a running total is not per anything
    if (widget.chart === "bars" || (widget.chart === "line" && widget.config.measure !== "running")) sub = per;
    else if (widget.chart === "list") sub = String(data.matched ?? "");
  }

  const copyQuery = () =>
    void copyTextToClipboard(widget.pql).then(() =>
      setToast({ type: "success", title: t("dashboards.widget.query_copied") })
    );

  return (
    <section
      aria-label={widget.title}
      data-widget-id={widget.id}
      className={cn(
        "group/widget relative col-span-full flex min-w-0 flex-col rounded-xl border border-strong bg-surface-1 md:[grid-column:span_var(--w)]",
        editing && "border-dashed border-accent-strong",
        lifted && "z-10 border-solid shadow-e3"
      )}
      style={{ ...style, gridRow: `span ${widget.height}`, ["--w" as string]: widget.width }}
    >
      {editing && (
        <button
          type="button"
          aria-label={t("dashboards.widget.drag", { title: widget.title })}
          onPointerDown={onGripDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") actions.onMove(-1);
            else if (e.key === "ArrowRight" || e.key === "ArrowDown") actions.onMove(1);
            else return;
            e.preventDefault();
          }}
          className="absolute top-2.5 -left-px flex h-[22px] w-3.5 cursor-grab touch-none items-center justify-center text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-accent-strong active:cursor-grabbing"
        >
          <GripOutline className="size-3" />
        </button>
      )}
      <div className="flex min-h-[34px] items-center gap-2 px-3.5 pt-[11px] pb-0.5">
        <span className="truncate text-13 font-semibold text-primary">{widget.title}</span>
        {sub && <span className="shrink-0 text-12 text-tertiary tabular-nums">{sub}</span>}
        <span className="flex-1" />
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label={t("dashboards.widget.actions")}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-secondary opacity-0 outline-none group-hover/widget:opacity-100 hover:bg-layer-1-hover focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-strong data-[popup-open]:opacity-100"
              >
                <MoreHorizontalOutline className="size-3.5" />
              </button>
            }
          />
          <MenuContent side="bottom" align="end">
            {canEdit && (
              <MenuGroup>
                <MenuItem icon={<EditOutline />} label={t("dashboards.widget.edit")} onClick={actions.onEdit} />
                <MenuItem
                  icon={<CopyOutline />}
                  label={t("dashboards.widget.duplicate")}
                  onClick={actions.onDuplicate}
                />
              </MenuGroup>
            )}
            {widget.pql.trim() && (
              <MenuItem icon={<CodeOutline />} label={t("dashboards.widget.copy_query")} onClick={copyQuery} />
            )}
            {canEdit && (
              <>
                <MenuSeparator />
                <MenuGroup>
                  <MenuItem label={t("dashboards.widget.move_earlier")} onClick={() => actions.onMove(-1)} />
                  <MenuItem label={t("dashboards.widget.move_later")} onClick={() => actions.onMove(1)} />
                  <MenuItem
                    label={t("dashboards.widget.wider")}
                    disabled={widget.width >= 12}
                    onClick={() => actions.onResize(Math.min(12, widget.width + 1), widget.height)}
                  />
                  <MenuItem
                    label={t("dashboards.widget.narrower")}
                    disabled={widget.width <= 2}
                    onClick={() => actions.onResize(Math.max(2, widget.width - 1), widget.height)}
                  />
                  <MenuItem
                    label={t("dashboards.widget.taller")}
                    disabled={widget.height >= 16}
                    onClick={() => actions.onResize(widget.width, Math.min(16, widget.height + 1))}
                  />
                  <MenuItem
                    label={t("dashboards.widget.shorter")}
                    disabled={widget.height <= 2}
                    onClick={() => actions.onResize(widget.width, Math.max(2, widget.height - 1))}
                  />
                </MenuGroup>
                <MenuSeparator />
                <MenuItem
                  variant="danger"
                  icon={<DeleteOutline />}
                  label={t("dashboards.widget.delete")}
                  onClick={actions.onDelete}
                />
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-hidden px-3.5 pt-2 pb-3">
        {data ? (
          <WidgetBody workspaceSlug={workspaceSlug} widget={widget} data={data} />
        ) : (
          <div className="min-h-8 flex-1 animate-pulse rounded-lg bg-layer-2" />
        )}
      </div>
      {showQuery && (
        <div className="flex h-7 shrink-0 items-center gap-1.5 overflow-hidden border-t border-subtle px-3.5 text-11 whitespace-nowrap text-tertiary">
          <CodeOutline className="size-3 shrink-0" />
          <PQLCode text={widget.pql.replace(/\s+/g, " ")} className="truncate" />
        </div>
      )}
      {editing && (
        <span
          role="presentation"
          onPointerDown={onCornerDown}
          className="absolute right-1 bottom-1 size-2.5 cursor-nwse-resize touch-none rounded-br-[3px] border-r-2 border-b-2 border-accent-strong"
        />
      )}
      {drop && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-2 w-0.5 rounded-full bg-accent-primary",
            drop === "before" ? "-left-[7px]" : "-right-[7px]"
          )}
        />
      )}
    </section>
  );
}
