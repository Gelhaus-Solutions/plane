/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROFILE_SETTINGS_TABS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileSettingsTabs } from "@plane/types";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PageHead } from "@/components/core/page-title";
import { ProfileSettingsContent } from "@/components/settings/profile/content";
import { SettingsMobileNav } from "@/components/settings/mobile/nav";
import { SettingsNavigation } from "@/components/settings/shell/navigation";
// hooks
import { useUser } from "@/hooks/store/user";
// local imports
import type { Route } from "../+types/layout";

function ProfileSettingsPage(props: Route.ComponentProps) {
  const { profileTabId } = props.params;
  // store hooks
  const { data: currentUser } = useUser();
  // translation
  const { t } = useTranslation();
  // derived values
  const isAValidTab = PROFILE_SETTINGS_TABS.includes(profileTabId as TProfileSettingsTabs);

  if (!currentUser || !isAValidTab)
    return (
      <div className="grid size-full place-items-center px-4">
        <LogoSpinner />
      </div>
    );

  return (
    <>
      <PageHead title={`${t("profile.label")} - ${t("general_settings")}`} />
      <SettingsMobileNav hamburgerContent={SettingsNavigation} activePath="profile.label" />
      <div className="relative size-full overflow-y-auto">
        <ProfileSettingsContent
          activeTab={profileTabId as TProfileSettingsTabs}
          className="mx-auto w-full max-w-205 px-8 pt-[26px] pb-12"
        />
      </div>
    </>
  );
}

export default observer(ProfileSettingsPage);
