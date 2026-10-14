/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Avatar } from "@makeplane/propel/components/avatar";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// plane imports
import { StateGroupIcon } from "@plane/blocks/icons";
import { useTranslation } from "@plane/i18n";
import type { TEpic, TEpicHealth, TEpicProgress, TStateGroups } from "@plane/types";
import { calculateTimeAgo, cn, getFileURL, renderFormattedDate } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";

/** The buckets of an epic's progress, in bar order, with the colour of their state icons. */
export const PROGRESS_SEGMENTS: { key: keyof Omit<TEpicProgress, "total" | "cancelled">; color: string }[] = [
  { key: "completed", color: "var(--txt-icon-states-completed)" },
  { key: "review", color: "var(--state-started-2)" },
  { key: "started", color: "var(--txt-icon-states-started)" },
  { key: "unstarted", color: "var(--txt-icon-states-unstarted)" },
  { key: "backlog", color: "var(--txt-icon-states-backlog)" },
];

export const shortDate = (date: string | null | undefined) => (date ? (renderFormattedDate(date, "MMM d") ?? "") : "");

export const progressPercent = (progress: TEpicProgress) =>
  progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

/** A segmented bar of an epic's children: done, review, in progress, todo and backlog, in their state colours. */
export function EpicProgressBar(props: { progress: TEpicProgress; width?: number; height?: number; gap?: number }) {
  const { progress, width, height = 6, gap = 1 } = props;
  const { t } = useTranslation();
  const total = PROGRESS_SEGMENTS.reduce((sum, segment) => sum + progress[segment.key], 0);
  return (
    <span
      role="img"
      aria-label={t("epics.progress_aria", { done: progress.completed, total: progress.total })}
      className="flex shrink-0 overflow-hidden rounded-full bg-layer-3"
      style={{ width: width ?? "100%", height, gap: total ? gap : 0 }}
    >
      {total > 0 &&
        PROGRESS_SEGMENTS.filter((segment) => progress[segment.key] > 0).map((segment) => (
          <span
            key={segment.key}
            className="h-full"
            style={{ width: `${(progress[segment.key] / total) * 100}%`, background: segment.color }}
          />
        ))}
    </span>
  );
}

/** The progress cell of the lists: the bar and "done / total". */
export function EpicProgressCell(props: { progress: TEpicProgress; width: number }) {
  const { progress, width } = props;
  return (
    <span className="flex items-center gap-2">
      <EpicProgressBar progress={progress} width={width} />
      <span className="text-12 whitespace-nowrap text-secondary tabular-nums">
        {progress.completed} / {progress.total}
      </span>
    </span>
  );
}

const HEALTH_CLASS: Record<TEpicHealth, string> = {
  on_track: "text-success-primary",
  at_risk: "text-warning-primary",
  off_track: "text-danger-primary",
};

/** A health chip: On track, At risk or Off track; "No update" when there is none. */
export function EpicHealthChip(props: { health: TEpicHealth | null; className?: string }) {
  const { health, className } = props;
  const { t } = useTranslation();
  if (!health) return <span className={cn("text-12 text-tertiary", className)}>{t("epics.health.none")}</span>;
  return (
    // Not through cn: tailwind-merge reads the colour and the size as one text-* group and drops the size
    <span
      className={`inline-flex h-[22px] items-center gap-[5px] rounded-[10px] border border-current px-[7px] text-[11.5px] whitespace-nowrap ${HEALTH_CLASS[health]} ${className ?? ""}`}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {t(`epics.health.${health}`)}
    </span>
  );
}

/** The health of a list row, with where it comes from in the tooltip: a posted update or the pace. */
export const EpicHealthCell = observer(function EpicHealthCell(props: { epic: TEpic }) {
  const { epic } = props;
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  let tip: string | undefined;
  if (epic.health_source === "update" && epic.latest_update) {
    const author = epic.latest_update.created_by ? getUserDetails(epic.latest_update.created_by) : undefined;
    tip = t("epics.health.posted", {
      name: author?.display_name ?? "",
      time: calculateTimeAgo(epic.latest_update.created_at),
    });
  } else if (epic.health_source === "pace") {
    tip = epic.projected_date
      ? t("epics.health.from_pace_date", { date: shortDate(epic.projected_date) })
      : t("epics.health.from_pace");
  }
  return (
    <Tooltip label={tip} side="bottom">
      <span className="inline-flex">
        <EpicHealthChip health={epic.health} />
      </span>
    </Tooltip>
  );
});

/** A person with their avatar, or "No lead" with an empty dashed circle. */
export const EpicLead = observer(function EpicLead(props: { userId: string | null; size?: number }) {
  const { userId, size = 18 } = props;
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const user = userId ? getUserDetails(userId) : undefined;
  if (!user)
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-secondary">
        <span
          className="shrink-0 rounded-full border border-dashed border-strong"
          style={{ width: size, height: size }}
          aria-hidden="true"
        />
        <span className="truncate">{t("epics.no_lead")}</span>
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-primary">
      <Avatar src={getFileURL(user.avatar_url ?? "")} alt={user.display_name} size="xs" tooltip={false} />
      <span className="truncate">{user.display_name}</span>
    </span>
  );
});

export function EpicStateIcon(props: { group: TStateGroups | null; size?: "sm" | "md" | "lg"; review?: boolean }) {
  return <StateGroupIcon stateGroup={props.group ?? "backlog"} review={props.review} size={props.size ?? "md"} />;
}

/** "Claude on PLANE-85": an agent working on one of the epic's children. */
export function EpicWorkingLine(props: { name: string; identifier: string }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-[5px] text-[11.5px] text-activity">
      <span className="inline-flex gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1 rounded-full bg-current motion-safe:animate-pulse"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </span>
      {t("epics.working", { name: props.name, id: props.identifier })}
    </span>
  );
}

/** A segmented control in the toolbar (the frame's `seg`). */
export function Segmented<T extends string>(props: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const { options, value, onChange, label } = props;
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-layer-2 p-0.5 text-12"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-6 items-center rounded-md px-2.5 text-secondary transition-colors duration-[120ms] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong",
            {
              "bg-surface-1 font-semibold text-primary shadow-e1 ring-1 ring-(--border-strong)": value === option.value,
            }
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The small bordered chip of the toolbars ("Group: wave"), as a button that opens a menu. */
export function ToolbarChip(props: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-[5px] rounded-[10px] border border-strong px-[7px] text-[11.5px] whitespace-nowrap text-secondary hover:text-primary [&_svg]:size-3">
      {props.icon}
      {props.children}
    </span>
  );
}
