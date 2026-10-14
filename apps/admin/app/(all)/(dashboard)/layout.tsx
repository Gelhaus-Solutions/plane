/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { Outlet } from "react-router";
// components
import { AdminHeader } from "@/components/common/header";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { NewUserPopup } from "@/components/common/new-user-popup";
// hooks
import { useUser } from "@/hooks/store";
// local components
import type { Route } from "./+types/layout";
import { AdminSidebar } from "./sidebar";

function AdminLayout(_props: Route.ComponentProps) {
  // router
  const { replace } = useRouter();
  // store hooks
  const { isUserLoggedIn } = useUser();

  useEffect(() => {
    if (isUserLoggedIn === false) replace("/");
  }, [replace, isUserLoggedIn]);

  if (isUserLoggedIn === undefined) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center">
        <LogoSpinner />
      </div>
    );
  }

  if (isUserLoggedIn) {
    return (
      <div className="relative flex h-screen w-screen overflow-hidden bg-canvas">
        <AdminSidebar />
        {/* The content panel, inset in the canvas beside the sidebar */}
        <main className="relative my-2 mr-2 ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-strong bg-surface-1 shadow-e1 md:ml-0">
          <AdminHeader />
          <div className="vertical-scrollbar scrollbar-md size-full overflow-hidden overflow-y-scroll">
            <Outlet />
          </div>
        </main>
        <NewUserPopup />
      </div>
    );
  }

  return <></>;
}

export default observer(AdminLayout);
