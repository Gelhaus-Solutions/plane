/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/project-feature-settings";

// The one-switch pages (features/cycles and the like) became one Features page (D45)
export const clientLoader = ({ params }: Route.ClientLoaderArgs) => {
  const { workspaceSlug, projectId } = params;
  throw redirect(`/${workspaceSlug}/settings/projects/${projectId}/features/`);
};

export default function ProjectFeatureSettings() {
  return null;
}
