/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
// local imports
import type { TDashboardData, TDashboardWidget } from "./types";
import { WidgetCard } from "./widget-card";

const GAP = 12;
const ROW = 40;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The widgets in their order, numbered afresh so a later move has room on both sides */
export const renumber = (widgets: TDashboardWidget[]) => widgets.map((w, i) => ({ ...w, sort_order: (i + 1) * 1000 }));

type Props = {
  workspaceSlug: string;
  widgets: TDashboardWidget[];
  data?: TDashboardData;
  per: string;
  canEdit: boolean;
  editing: boolean;
  /** A new order or size, to keep */
  onLayout: (next: TDashboardWidget[]) => void;
  onEdit: (widget: TDashboardWidget) => void;
  onDuplicate: (widget: TDashboardWidget) => void;
  onDelete: (widget: TDashboardWidget) => void;
};

type TDrag = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  drop: { id: string; side: "before" | "after" } | null;
};
type TResize = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colWidth: number;
  w: number;
  h: number;
};

/** Twelve columns of 40 px rows: drag a widget by its grip to move it, pull its corner to resize it (r5-21 edit) */
export function DashboardGrid(props: Props) {
  const { workspaceSlug, widgets, data, per, canEdit, editing, onLayout, onEdit, onDuplicate, onDelete } = props;
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<TDrag | null>(null);
  const [resize, setResize] = useState<TResize | null>(null);
  // the pointer handlers read the latest gesture without being rebuilt on every move
  const gesture = useRef<{ drag: TDrag | null; resize: TResize | null }>({ drag: null, resize: null });
  gesture.current = { drag, resize };
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const move = useCallback(
    (id: string, step: -1 | 1) => {
      const list = [...widgetsRef.current];
      const from = list.findIndex((w) => w.id === id);
      const to = from + step;
      if (from < 0 || to < 0 || to >= list.length) return;
      [list[from], list[to]] = [list[to], list[from]];
      onLayout(renumber(list));
    },
    [onLayout]
  );

  const sizeTo = useCallback(
    (id: string, width: number, height: number) =>
      onLayout(widgetsRef.current.map((w) => (w.id === id ? { ...w, width, height } : w))),
    [onLayout]
  );

  useEffect(() => {
    if (!drag && !resize) return;
    const onMove = (e: PointerEvent) => {
      const { drag: d, resize: r } = gesture.current;
      if (d) {
        const target = document
          .elementsFromPoint(e.clientX, e.clientY)
          .map((element) => element.closest<HTMLElement>("[data-widget-id]"))
          .find((element) => element && element.dataset.widgetId !== d.id);
        let drop: TDrag["drop"] = null;
        if (target?.dataset.widgetId) {
          const rect = target.getBoundingClientRect();
          drop = { id: target.dataset.widgetId, side: e.clientX < rect.left + rect.width / 2 ? "before" : "after" };
        }
        setDrag({ ...d, dx: e.clientX - d.x, dy: e.clientY - d.y, drop });
      } else if (r) {
        const fullWidth = r.width * r.colWidth + (r.width - 1) * GAP + (e.clientX - r.x);
        const fullHeight = r.height * ROW + (r.height - 1) * GAP + (e.clientY - r.y);
        setResize({
          ...r,
          w: clamp(Math.round((fullWidth + GAP) / (r.colWidth + GAP)), 2, 12),
          h: clamp(Math.round((fullHeight + GAP) / (ROW + GAP)), 2, 16),
        });
      }
    };
    const onUp = () => {
      const { drag: d, resize: r } = gesture.current;
      if (d?.drop) {
        const list = widgetsRef.current.filter((w) => w.id !== d.id);
        const dragged = widgetsRef.current.find((w) => w.id === d.id);
        const at = list.findIndex((w) => w.id === d.drop?.id);
        if (dragged && at >= 0) {
          list.splice(d.drop.side === "before" ? at : at + 1, 0, dragged);
          onLayout(renumber(list));
        }
      }
      if (r && (r.w !== r.width || r.h !== r.height)) sizeTo(r.id, r.w, r.h);
      setDrag(null);
      setResize(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape drops the gesture, not the edit mode
      e.stopPropagation();
      setDrag(null);
      setResize(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    // the handlers read the gesture through the ref; they only need to exist while one runs
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, !!resize, onLayout, sizeTo]);

  const startDrag = (widget: TDashboardWidget) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDrag({ id: widget.id, x: e.clientX, y: e.clientY, dx: 0, dy: 0, drop: null });
  };

  const startResize = (widget: TDashboardWidget) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || !gridRef.current) return;
    e.preventDefault();
    const colWidth = (gridRef.current.getBoundingClientRect().width - 11 * GAP) / 12;
    setResize({
      id: widget.id,
      x: e.clientX,
      y: e.clientY,
      width: widget.width,
      height: widget.height,
      colWidth,
      w: widget.width,
      h: widget.height,
    });
  };

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-12 gap-3"
      style={{ gridAutoRows: `${ROW}px`, userSelect: drag || resize ? "none" : undefined }}
    >
      {widgets.map((widget) => {
        const sized = resize?.id === widget.id ? { ...widget, width: resize.w, height: resize.h } : widget;
        const dragging = drag?.id === widget.id;
        return (
          <WidgetCard
            key={widget.id}
            workspaceSlug={workspaceSlug}
            widget={sized}
            data={data?.widgets[widget.id]}
            per={per}
            canEdit={canEdit}
            editing={editing}
            lifted={dragging || resize?.id === widget.id}
            drop={drag?.drop?.id === widget.id ? drag.drop.side : null}
            style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px)`, pointerEvents: "none" } : undefined}
            onGripDown={startDrag(widget)}
            onCornerDown={startResize(widget)}
            actions={{
              onEdit: () => onEdit(widget),
              onDuplicate: () => onDuplicate(widget),
              onDelete: () => onDelete(widget),
              onMove: (step) => move(widget.id, step),
              onResize: (width, height) => sizeTo(widget.id, width, height),
            }}
          />
        );
      })}
    </div>
  );
}
