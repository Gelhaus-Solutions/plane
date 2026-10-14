/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTheme as useNextTheme } from "next-themes";
import { Avatar } from "@makeplane/propel/components/avatar";
import { Icon } from "@makeplane/propel/components/icon";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@makeplane/propel/components/menu";
import { LogOutOutline, PaletteOutline } from "@makeplane/propel/icons";
// plane internal packages
import { API_BASE_URL } from "@plane/constants";
import { AuthService } from "@plane/services";
import { getFileURL } from "@plane/utils";
// hooks
import { useUser } from "@/hooks/store";

// service initialization
const authService = new AuthService();

/** The signed-in admin at the bottom of the God mode sidebar: avatar, name and an admin tag, opening the menu. */
export const AdminSidebarAdminRow = observer(function AdminSidebarAdminRow() {
  // store hooks
  const { currentUser, signOut } = useUser();
  // hooks
  const { resolvedTheme, setTheme } = useNextTheme();
  // state
  const [csrfToken, setCsrfToken] = useState<string | undefined>(undefined);
  // refs
  // A Base UI menu closes (and unmounts its rows) on item press, so a submit button inside the
  // panel would be detached before the browser ran the default action. The sign-out form lives
  // outside the menu and the row submits it explicitly.
  const signOutFormRef = useRef<HTMLFormElement>(null);

  const handleThemeSwitch = () => {
    const newTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  const handleSignOut = () => signOut();

  useEffect(() => {
    if (csrfToken === undefined)
      void authService.requestCSRFToken().then((data) => data?.csrf_token && setCsrfToken(data.csrf_token));
  }, [csrfToken]);

  const name = currentUser?.display_name || [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ");

  return (
    <div className="border-t border-subtle pt-2">
      <form
        ref={signOutFormRef}
        className="hidden"
        method="POST"
        action={`${API_BASE_URL}/api/instances/admins/sign-out/`}
        onSubmit={handleSignOut}
      >
        <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
      </form>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label="Admin menu"
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[7px] px-1.5 text-left text-13 text-primary transition-colors duration-[120ms] outline-none hover:bg-layer-1-hover"
            >
              <Avatar
                alt={name || "Admin"}
                fallback={name?.[0]?.toUpperCase()}
                src={getFileURL(currentUser?.avatar_url ?? "")}
                size="xs"
              />
              <span className="truncate font-medium">{name}</span>
              <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-md border border-strong px-1.5 text-11 text-secondary">
                admin
              </span>
            </button>
          }
        />
        <MenuContent side="top" align="start">
          <MenuGroup>
            <MenuLabel>{currentUser?.email}</MenuLabel>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem
            icon={<Icon icon={PaletteOutline} />}
            label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            onClick={handleThemeSwitch}
          />
          <MenuSeparator />
          <MenuItem
            icon={<Icon icon={LogOutOutline} />}
            label="Sign out"
            onClick={() => signOutFormRef.current?.requestSubmit()}
          />
        </MenuContent>
      </Menu>
    </div>
  );
});
