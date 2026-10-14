/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { EpicDetailRoot } from "@/components/epics/epic-detail/root";
// hooks
import { useEpic } from "@/hooks/store/use-epic";
import type { Route } from "./+types/page";

function EpicDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, epicId } = params;
  const { getEpicById } = useEpic();
  const epic = getEpicById(epicId);

  return (
    <>
      <PageHead title={epic?.name} />
      <EpicDetailRoot workspaceSlug={workspaceSlug} projectId={projectId} epicId={epicId} />
    </>
  );
}

export default observer(EpicDetailPage);
