/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Badge } from "@makeplane/propel/components/badge";
// plane imports
import { BotAvatar } from "@plane/blocks/bot-avatar";
import { MemberSelect as MemberSelectBlock } from "@plane/blocks/property-select";
import type { MemberOption, MemberSelectVariant } from "@plane/blocks/property-select";
import type { SelectPaginationParams, SelectTooltip, SelectTooltipOverride } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TAgentSession, TIssueAgent, TPaginatedResponse } from "@plane/types";
import { cn, getFileURL } from "@plane/utils";
// components
import { AgentStatusBadge } from "@/components/agents/status-badge";
import { useProjectBotIds } from "@/components/agents/use-project-bots";
import { MemberSelect } from "@/components/dropdowns/member/member-select";
// helpers
import { botFaceOf, displayStatusOf, harnessLabelKey, shortDir } from "@/helpers/agent.helper";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";

const SESSION_PREFIX = "session:";
const isSessionId = (id: string) => id.startsWith(SESSION_PREFIX);
const sessionIdOf = (id: string) => id.slice(SESSION_PREFIX.length);
const toSessionOptionId = (sessionId: string) => `${SESSION_PREFIX}${sessionId}`;

type Props = {
  projectId: string;
  issueId: string;
  /** The work item's assignee ids, bots included. */
  value: string[];
  /** The assignee ids to save when people change; the bots on the item are in it, as they were. */
  onChange?: (ids: string[]) => void;
  /** `assignee`: people, and bots with their sessions. `delegate`: only bots, who work for the item's assignee. */
  mode?: "assignee" | "delegate";
  variant: MemberSelectVariant;
  showLabel?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onClose?: () => void;
  className?: string;
  tooltip?: SelectTooltip;
  testId?: string;
  tabIndex?: number;
};

/**
 * The assignee picker of a work item (D46, r6-18): People, then the project's bots, each a row for its queue with
 * its live and away sessions indented below it. Picking a bot puts the item in its queue, picking a session gives
 * it to that one run, which hears it; both go through the agents path, so the session is told. In `delegate` mode
 * the same list offers only bots, and the item's assignee stays accountable.
 */
export const AssigneeSelect = observer(function AssigneeSelect(props: Props) {
  const {
    projectId,
    issueId,
    value,
    onChange,
    mode = "assignee",
    variant,
    showLabel,
    onClose,
    className,
    tooltip,
    ...rest
  } = props;
  const isDelegate = mode === "delegate";
  // router params
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  // store hooks
  const agent = useAgent();
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();
  const { data: currentUser } = useUser();
  // translation
  const { t } = useTranslation();
  const youLabel = t("you");

  const hasBots = useProjectBotIds(projectId).length > 0;
  // the rows of a list show which session an agent assignee names; one load serves every row of the project
  useEffect(() => {
    if (hasBots && slug) void agent.ensureProjectRows(slug, projectId).catch(() => undefined);
  }, [agent, hasBots, slug, projectId]);
  const rows = agent.getIssueAgents(issueId);
  const rowByBot = new Map<string, TIssueAgent>(rows.map((row) => [row.bot.id, row]));
  const delegatedIds = new Set(rows.filter((row) => row.delegated).map((row) => row.bot.id));
  const selectedIds = isDelegate ? [...delegatedIds] : value.filter((id) => !delegatedIds.has(id));

  const resolvedTooltip = useMemo<SelectTooltipOverride | undefined>(() => {
    if (!tooltip) return undefined;
    const override = typeof tooltip === "object" ? tooltip : undefined;
    return {
      heading: override?.heading ?? t("common.members"),
      emptyContent: override?.emptyContent ?? t("common.none"),
    };
  }, [tooltip, t]);

  const personOption = useCallback(
    (id: string, group?: string): MemberOption => {
      const member = getUserDetails(id);
      const name = member?.display_name ?? "";
      return {
        id,
        display_name: id === currentUser?.id ? `${name} (${youLabel})` : name,
        name,
        avatar_url: getFileURL(member?.avatar_url ?? ""),
        group,
      };
    },
    [getUserDetails, currentUser?.id, youLabel]
  );

  const botOption = useCallback(
    (id: string, extra: Partial<MemberOption> = {}): MemberOption => {
      const member = getUserDetails(id);
      const name = member?.display_name ?? "";
      return {
        id,
        display_name: name,
        name,
        bot: botFaceOf(agent.getBotHarness(id, name)),
        ...extra,
      };
    },
    [getUserDetails, agent]
  );

  const sessionOption = useCallback(
    (session: Pick<TAgentSession, "id" | "name" | "status"> & Partial<TAgentSession>, extra: Partial<MemberOption>) => {
      const full = agent.getSessionById(session.id);
      const status = displayStatusOf({ status: session.status, holds: full?.holds ?? [] });
      const away = session.status !== "live";
      return {
        id: toSessionOptionId(session.id),
        display_name: session.name,
        name: session.name,
        icon: (
          <span className="ml-2 grid size-5 shrink-0 place-items-center text-tertiary">
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        ),
        content: (
          <span className={cn("flex min-w-0 items-center gap-2", away && "opacity-60")}>
            <span className="shrink-0 font-code text-caption-md-regular">{session.name}</span>
            <span className="shrink-0">
              <AgentStatusBadge status={status} />
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-code text-caption-md-regular text-tertiary">
              {shortDir(full?.primary_dir)}
            </span>
          </span>
        ),
        ...extra,
      } satisfies MemberOption;
    },
    [agent]
  );

  // What is checked: the people and bots on the item, and the session a bot's row names.
  const selected = useMemo<MemberOption[]>(() => {
    const options: MemberOption[] = [];
    for (const id of selectedIds) {
      if (getUserDetails(id)?.is_bot) {
        const row = rowByBot.get(id);
        const session = row?.session && row.state === "session" ? row.session : null;
        const name = getUserDetails(id)?.display_name ?? "";
        options.push(botOption(id, session ? { display_name: `${name} · ${session.name}` } : {}));
        if (session) options.push(sessionOption(session, { hiddenInTrigger: true }));
      } else {
        options.push(personOption(id));
      }
    }
    return options;
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(","), rows, getUserDetails, botOption, sessionOption, personOption]);

  const getValues = useCallback(
    async ({ search }: SelectPaginationParams): Promise<TPaginatedResponse<MemberOption[]>> => {
      let roster = getProjectMemberIds(projectId, false);
      if (!roster && slug) {
        await fetchProjectMembers(slug, projectId);
        roster = getProjectMemberIds(projectId, false);
      }
      // the sessions and the item's agents are fresh each time the list opens; a failure leaves the bots as queues
      await Promise.allSettled([agent.fetchPickableSessions(slug), agent.fetchIssueAgents(slug, projectId, issueId)]);
      const assignedBotIds = new Set(
        agent
          .getIssueAgents(issueId)
          .filter((row) => !row.delegated)
          .map((row) => row.bot.id)
      );
      const query = search?.trim().toLowerCase();
      const people: MemberOption[] = [];
      const bots: MemberOption[] = [];
      const rosterHasBots = (roster ?? []).some((id) => getUserDetails(id)?.is_bot);
      const peopleGroup = rosterHasBots ? t("agents.picker.people") : undefined;
      const botsGroup = t("agents.picker.bots_and_sessions");
      for (const id of roster ?? []) {
        const member = getUserDetails(id);
        if (!member) continue;
        const names = `${member.display_name} ${member.first_name} ${member.last_name}`.toLowerCase();
        if (!member.is_bot) {
          if (isDelegate || (query && !names.includes(query))) continue;
          if (id === currentUser?.id) people.unshift(personOption(id, peopleGroup));
          else people.push(personOption(id, peopleGroup));
          continue;
        }
        // an agent that is the assignee is not delegated to: it works for itself
        if (isDelegate && assignedBotIds.has(id)) continue;
        const harness = agent.getBotHarness(id, member.display_name);
        const sessions = agent.getBotSessions(id);
        const botMatches = !query || names.includes(query);
        const matching = botMatches
          ? sessions
          : sessions.filter((session) => `${session.name} ${session.primary_dir}`.toLowerCase().includes(query));
        if (!botMatches && matching.length === 0) continue;
        bots.push(
          botOption(id, {
            group: botsGroup,
            icon: (
              <span className="grid size-5 shrink-0 place-items-center">
                <BotAvatar name={member.display_name} bot {...botFaceOf(harness)} size={20} />
              </span>
            ),
            content: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{member.display_name}</span>
                <Badge variant="purple" size="xs" label={t("agents.bot")} />
                <span className="min-w-0 flex-1 truncate text-caption-md-regular text-tertiary">
                  {t("agents.picker.queue_hint")}
                </span>
              </span>
            ),
            trailing: <span className="text-caption-md-regular text-tertiary">{t(harnessLabelKey(harness))}</span>,
          })
        );
        for (const session of matching) bots.push(sessionOption(session, { group: botsGroup }));
      }
      return { results: [...people, ...bots], next_page_results: false };
    },
    [
      agent,
      botOption,
      currentUser?.id,
      fetchProjectMembers,
      getProjectMemberIds,
      getUserDetails,
      isDelegate,
      issueId,
      personOption,
      projectId,
      sessionOption,
      slug,
      t,
    ]
  );

  const handleChange = useCallback(
    async (nextIds: string[]) => {
      const before = new Set(selected.map((option) => option.id));
      const after = new Set(nextIds);
      const added = nextIds.filter((id) => !before.has(id));
      const removed = [...before].filter((id) => !after.has(id));
      const isBot = (id: string) => !!getUserDetails(id)?.is_bot;
      const botOfSession = (id: string) => agent.getSessionById(sessionIdOf(id))?.bot.user_id;

      // people are the item's own assignee list; the bots already on it ride along unchanged
      if (added.some((id) => !isSessionId(id) && !isBot(id)) || removed.some((id) => !isSessionId(id) && !isBot(id))) {
        const botsOnItem = rows.map((row) => row.bot.id);
        onChange?.([...nextIds.filter((id) => !isSessionId(id) && !isBot(id)), ...botsOnItem]);
        return;
      }

      // one change at a time, in order: the item's agents are one row per bot, so the calls must not race
      const dropped = new Set(removed.filter(isBot));
      const placed = new Set(added.filter(isSessionId).map((id) => botOfSession(id) ?? ""));
      const calls: (() => Promise<unknown>)[] = [
        ...[...dropped].map((botId) => () => agent.unassign(slug, projectId, issueId, botId)),
        ...added
          .filter(isSessionId)
          .map(
            (id) => () => agent.assign(slug, projectId, issueId, { session: sessionIdOf(id), delegate: isDelegate })
          ),
        ...added
          .filter((id) => !isSessionId(id) && isBot(id) && !placed.has(id))
          .map((id) => () => agent.assign(slug, projectId, issueId, { bot: id, delegate: isDelegate })),
        // a session unchecked while its bot stays: the bot goes back to being a queue
        ...removed
          .filter(isSessionId)
          .map((id) => botOfSession(id))
          .filter((botId): botId is string => !!botId && !dropped.has(botId) && !placed.has(botId))
          .map((botId) => () => agent.assign(slug, projectId, issueId, { bot: botId, delegate: isDelegate })),
      ];
      try {
        await calls.reduce<Promise<unknown>>((chain, call) => chain.then(call), Promise.resolve());
      } catch (error) {
        console.error(error);
        setToast({ type: "error", title: t("common.error.label"), message: t("agents.picker.failed") });
      }
    },
    [agent, getUserDetails, isDelegate, issueId, onChange, projectId, rows, selected, slug, t]
  );

  const firstName = (() => {
    const first = value.find((id) => !getUserDetails(id)?.is_bot);
    return first ? getUserDetails(first)?.display_name : undefined;
  })();

  // a project without bots has nothing but people to offer: the plain member picker
  if (!hasBots && !isDelegate) {
    return (
      <MemberSelect
        multiple
        projectId={projectId}
        value={value}
        onChange={onChange ?? (() => undefined)}
        variant={variant}
        showLabel={showLabel}
        onClose={onClose}
        className={className}
        tooltip={tooltip}
        {...rest}
      />
    );
  }

  return (
    <MemberSelectBlock
      multiple
      getValues={getValues}
      value={selected}
      onChange={(ids) => void handleChange(ids)}
      variant={variant}
      // one face reads with its name, several as faces; the bots that only work for the assignee do not count
      showLabel={showLabel ?? selectedIds.length <= 1}
      onClose={onClose}
      className={className}
      tooltip={resolvedTooltip}
      searchPlaceholder={t(isDelegate ? "agents.picker.delegate_search" : "agents.picker.assignee_search")}
      footer={
        hasBots ? (
          // the longest line of the panel, so the panel opens wide enough for a bot's row (r6-18)
          <p className="min-w-[24rem] px-2 py-1.5 text-caption-md-regular text-tertiary">
            {isDelegate
              ? firstName
                ? t("agents.picker.delegate_footer", { name: firstName })
                : t("agents.picker.delegate_footer_nobody")
              : t("agents.picker.assignee_footer")}
          </p>
        ) : undefined
      }
      pinSelected={false}
      {...rest}
    />
  );
});
