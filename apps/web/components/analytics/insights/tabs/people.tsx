/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Avatar } from "@makeplane/propel/components/avatar";
// plane imports
import { useTranslation } from "@plane/i18n";
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { getFileURL } from "@plane/utils";
// local imports
import { ChartCard, InsightsTable } from "../../charts/cards";
import type { TSeries } from "../../charts/charts";
import { formatNumber, Legend, LineChart, Sparkline } from "../../charts/charts";
import { useExportTable } from "../export";
import type { TMemberRow, TPeopleInsights } from "../types";
import { useInsights } from "../use-insights";
import { TabBody, TabError, TabLoading, TOKENS, usePeriodWords } from "./common";

const K = "workspace_analytics.insights";
// the chart draws the busiest few; the table lists everyone
const CHARTED = 3;

function MemberMark(props: { member: TMemberRow }) {
  const { member } = props;
  if (member.avatar_url && !member.is_bot)
    return <Avatar src={getFileURL(member.avatar_url)} alt={member.name} fallback={member.name[0]} size="sm" />;
  return <BotAvatar name={member.name} bot={member.is_bot} size={20} />;
}

/** People and bots (r5-10): done per bucket on one scale, and every member's open, in progress, done and pace */
export const PeopleTab = observer(function PeopleTab() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data, error } = useInsights<TPeopleInsights>(workspaceSlug?.toString() ?? "", "people");
  const { labels } = usePeriodWords(data?.period);
  const days = data?.period.days ?? 0;

  const exportTable = useMemo(
    () =>
      data
        ? {
            name: `analytics-people-${data.period.start}-${data.period.end}`,
            rows: data.members.map((m) => ({
              [t(`${K}.member`)]: m.name,
              [t(`${K}.type`)]: t(m.is_bot ? `${K}.bot` : `${K}.person`),
              [t(`${K}.open`)]: m.open,
              [t(`${K}.in_progress`)]: m.in_progress,
              [t(`${K}.done_days`, { days })]: m.done,
              [t(`${K}.median_short`)]: m.median_days_to_done ?? "",
            })),
          }
        : null,
    [data, days, t]
  );
  useExportTable(exportTable);

  if (error && !data) return <TabError />;
  if (!data) return <TabLoading />;

  const charted = data.members.slice(0, CHARTED);
  const series: TSeries[] = charted.map((m, i) => ({ name: m.name, token: TOKENS[i], values: m.done_per_bucket }));
  const people = data.members.filter((m) => !m.is_bot).length;
  const perTitle = t(data.period.bucket === "day" ? `${K}.done_per_day` : `${K}.done_per_week`);

  return (
    <TabBody>
      <ChartCard title={perTitle} sub={t(`${K}.same_scale`)}>
        {series.length > 0 ? (
          <>
            <Legend series={series.map((s) => ({ name: s.name, token: s.token, line: true }))} />
            <LineChart series={series} labels={labels} width={900} />
          </>
        ) : (
          <p className="py-6 text-center text-12 text-tertiary">{t(`${K}.no_members`)}</p>
        )}
      </ChartCard>
      <ChartCard
        title={t(`${K}.members`)}
        sub={t(`${K}.members_count`, { people, bots: data.members.length - people })}
      >
        <InsightsTable
          columns={[
            { key: "member", label: t(`${K}.member`), width: "minmax(0,1fr)" },
            { key: "type", label: t(`${K}.type`), width: "90px" },
            { key: "open", label: t(`${K}.open`), width: "80px", align: "right" },
            { key: "in_progress", label: t(`${K}.in_progress`), width: "90px", align: "right" },
            { key: "done", label: t(`${K}.done_days`, { days }), width: "90px", align: "right", strong: true },
            { key: "median", label: t(`${K}.median_short`), width: "110px", align: "right" },
            { key: "trend", label: perTitle, width: "140px" },
          ]}
          rows={data.members.map((m, i) => ({
            key: m.id,
            cells: {
              member: (
                <>
                  <MemberMark member={m} />
                  <span className="truncate font-medium">{m.name}</span>
                  {m.is_bot && (
                    <span className="inline-flex h-4 items-center rounded-[5px] bg-loz-review-bg px-[5px] text-[9.5px] font-semibold tracking-[0.06em] text-loz-review-fg">
                      BOT
                    </span>
                  )}
                </>
              ),
              type: <span className="text-secondary">{t(m.is_bot ? `${K}.bot` : `${K}.person`)}</span>,
              open: m.open,
              in_progress: m.in_progress,
              done: m.done,
              median: (
                <span className="text-secondary">
                  {m.median_days_to_done === null
                    ? ""
                    : t(`${K}.days_short`, { value: formatNumber(m.median_days_to_done) })}
                </span>
              ),
              trend: <Sparkline values={m.done_per_bucket} token={i < CHARTED ? TOKENS[i] : "chart-ref"} height={24} />,
            },
          }))}
          empty={t(`${K}.no_members`)}
        />
      </ChartCard>
    </TabBody>
  );
});
