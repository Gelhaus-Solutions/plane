/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { AnalyticsHeader } from "@/components/analytics/insights/header";

export default function WorkspaceAnalyticsTabLayout() {
  return (
    <div className="flex size-full flex-col overflow-hidden">
      <AnalyticsHeader />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
