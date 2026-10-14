/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowNarrowLeftOutline } from "@makeplane/propel/icons";
import { observer } from "mobx-react";
// plane imports
import { ROLE_DETAILS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ProjectBadge } from "@plane/blocks/project-badge";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Icon } from "@makeplane/propel/components/icon";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";

type Props = {
  projectId: string;
};

export const ProjectSettingsSidebarHeader = observer(function ProjectSettingsSidebarHeader(props: Props) {
  const { projectId } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { getPartialProjectById } = useProject();
  // derived values
  const projectDetails = getPartialProjectById(projectId);
  const currentProjectRole = currentWorkspace?.slug
    ? getProjectRoleByWorkspaceSlugAndProjectId(currentWorkspace.slug, projectId)
    : undefined;
  // translation
  const { t } = useTranslation();

  if (!currentProjectRole) return null;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1 py-3 pr-5 pl-4 text-body-md-medium">
        <IconButton
          variant="ghost"
          size="sm"
          icon={<Icon icon={ArrowNarrowLeftOutline} />}
          aria-label="Back to project"
          onClick={() => router.push(`/${currentWorkspace?.slug}/projects/${projectId}/issues/`)}
        />
        <p>Project settings</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2 truncate px-5 py-0.5">
        <ProjectBadge
          name={projectDetails?.name ?? ""}
          seed={projectDetails?.id}
          logo={projectDetails?.logo_props}
          size={32}
          logoSize={20}
          logoClassName="rounded bg-layer-2"
        />
        <div className="truncate">
          <p className="truncate text-body-sm-medium">{projectDetails?.name}</p>
          <p className="truncate text-caption-md-regular">{t(ROLE_DETAILS[currentProjectRole].i18n_title)}</p>
        </div>
      </div>
    </div>
  );
});
