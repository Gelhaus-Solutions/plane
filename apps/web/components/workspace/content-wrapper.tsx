/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";

/**
 * The workspace shell in the Pulse design: no top bar and no app rail. The canvas shows around the sidebar and the
 * inset content panel, which each layout draws itself.
 */
export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="relative flex size-full overflow-hidden bg-canvas">{children}</div>;
});
