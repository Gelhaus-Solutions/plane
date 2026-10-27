/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate } from "swr";
import type { TAgentQuestion, TIssueAgentOverview, TNeedsYou } from "@plane/types";
import { renderFormattedDate, renderFormattedTime } from "@plane/utils";
// services
import { AgentService } from "@/services/agent.service";

/** Agent steering (E29): a work item's Agent tab and Needs you, both asked again every half minute as the Agents page is */
export const steeringService = new AgentService();

const REFRESH_MS = 30_000;
const overviewKey = (issueId: string) => ["agent-overview", issueId];
const needsYouKey = (workspaceSlug: string) => ["needs-you", workspaceSlug];

export function useIssueAgentOverview(workspaceSlug: string, projectId: string, issueId: string) {
  return useSWR<TIssueAgentOverview>(
    workspaceSlug && projectId && issueId ? overviewKey(issueId) : null,
    () => steeringService.issueOverview(workspaceSlug, projectId, issueId),
    { refreshInterval: REFRESH_MS, revalidateOnFocus: false }
  );
}

export function useNeedsYou(workspaceSlug: string) {
  return useSWR<TNeedsYou>(
    workspaceSlug ? needsYouKey(workspaceSlug) : null,
    () => steeringService.needsYou(workspaceSlug),
    { refreshInterval: REFRESH_MS, revalidateOnFocus: false }
  );
}

/** After an answer, a withdrawal, a close or a send back: the item's Agent tab, Needs you and its count follow */
export const refreshSteering = (workspaceSlug: string, issueId: string) =>
  Promise.all([mutate(overviewKey(issueId)), mutate(needsYouKey(workspaceSlug))]);

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

/** A deadline as people read it: 18:00 today, tomorrow 09:00, or Oct 30, 09:00 */
export const deadlineAt = (t: TTranslate, deadline: string) => {
  const time = renderFormattedTime(deadline);
  const days = Math.round((midnight(new Date(deadline)) - midnight(new Date())) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return t("agents.steering.tomorrow_at", { time });
  return `${renderFormattedDate(deadline, "MMM d") ?? ""}, ${time}`;
};

/** How long until a deadline, as 5h 48m or 12m; empty once it passed */
export const deadlineIn = (deadline: string, locale: string) => {
  const minutes = Math.round((new Date(deadline).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "";
  const unit = (value: number, name: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "narrow" }).format(value);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return [unit(days, "day"), hours ? unit(hours, "hour") : ""].filter(Boolean).join(" ");
  return [hours ? unit(hours, "hour") : "", unit(minutes % 60, "minute")].filter(Boolean).join(" ");
};

/** The option a question falls back to, by its label */
export const defaultLabel = (question: TAgentQuestion) =>
  question.default_option ? (question.options[question.default_option - 1]?.label ?? "") : "";
