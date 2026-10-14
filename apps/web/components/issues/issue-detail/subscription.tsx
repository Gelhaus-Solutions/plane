/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { isNil } from "lodash-es";
import { observer } from "mobx-react";
import { SubscribeOutline, UnsubscribeOutline } from "@makeplane/propel/icons";
// plane-i18n
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// UI
import { Button } from "@makeplane/propel/elements/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { setToast } from "@plane/blocks/toast";
import { EIssueServiceType } from "@plane/types";
import { Loader } from "@plane/blocks/skeleton";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUserPermissions } from "@/hooks/store/user";

export type TIssueSubscription = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  serviceType?: EIssueServiceType;
  /** A bell icon button, as in the detail page's and the peek's top bars (4A, 5A). */
  compact?: boolean;
};

export const IssueSubscription = observer(function IssueSubscription(props: TIssueSubscription) {
  const { workspaceSlug, projectId, issueId, serviceType = EIssueServiceType.ISSUES, compact = false } = props;
  const { t } = useTranslation();
  // hooks
  const {
    subscription: { getSubscriptionByIssueId },
    createSubscription,
    removeSubscription,
  } = useIssueDetail(serviceType);
  // state
  const [loading, setLoading] = useState(false);
  // hooks
  const { allowPermissions } = useUserPermissions();

  const isSubscribed = getSubscriptionByIssueId(issueId);
  const isEditable = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const handleSubscription = async () => {
    setLoading(true);
    try {
      if (isSubscribed) await removeSubscription(workspaceSlug, projectId, issueId);
      else await createSubscription(workspaceSlug, projectId, issueId);
      setToast({
        type: "success",
        title: t("toast.success"),
        message: isSubscribed
          ? t("issue.subscription.actions.unsubscribed")
          : t("issue.subscription.actions.subscribed"),
      });
      setLoading(false);
    } catch {
      setLoading(false);
      setToast({
        type: "error",
        title: t("toast.error"),
        message: t("common.error.message"),
      });
    }
  };

  if (isNil(isSubscribed))
    return (
      <Loader>
        <Loader.Item width={compact ? "28px" : "106px"} height="28px" />
      </Loader>
    );

  if (compact) {
    const label = isSubscribed ? t("common.actions.unsubscribe") : t("common.actions.subscribe");
    return (
      <Tooltip label={label} side="bottom">
        <IconButton
          size="md"
          variant="ghost"
          icon={<Icon icon={isSubscribed ? UnsubscribeOutline : SubscribeOutline} />}
          aria-label={label}
          aria-pressed={isSubscribed}
          onClick={() => void handleSubscription()}
          disabled={!isEditable || loading}
        />
      </Tooltip>
    );
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="md"
        stretch="auto"
        render={<button type="button" />}
        onClick={handleSubscription}
        disabled={!isEditable || loading}
      >
        <Icon icon={isSubscribed ? UnsubscribeOutline : SubscribeOutline} />
        {loading ? (
          <span>
            <span className="hidden sm:block">{t("common.loading")}</span>
          </span>
        ) : isSubscribed ? (
          <div className="hidden sm:block">{t("common.actions.unsubscribe")}</div>
        ) : (
          <div className="hidden sm:block">{t("common.actions.subscribe")}</div>
        )}
      </Button>
    </div>
  );
});
