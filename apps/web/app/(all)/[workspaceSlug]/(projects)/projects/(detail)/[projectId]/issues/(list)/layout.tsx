/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { WorkItemsHeader } from "@/components/issues/work-items-header";

export default function ProjectIssuesLayout() {
  return (
    <div className="flex size-full flex-col overflow-hidden">
      <WorkItemsHeader />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </div>
  );
}
