/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { EpicsOff } from "@/components/epics/epics-off";
import { ProjectEpicsRoot } from "@/components/epics/project-epics";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectEpicsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const project = getProjectById(projectId);

  return (
    <>
      <PageHead title={project?.name ? `${project.name} - ${t("epics.title")}` : undefined} />
      {project?.epic_view === false ? (
        <EpicsOff workspaceSlug={workspaceSlug} projectId={projectId} />
      ) : (
        <ProjectEpicsRoot workspaceSlug={workspaceSlug} projectId={projectId} />
      )}
    </>
  );
}

export default observer(ProjectEpicsPage);
