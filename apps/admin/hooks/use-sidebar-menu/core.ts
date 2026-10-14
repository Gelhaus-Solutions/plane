/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import {
  AiStar1Outline,
  ImageOutline,
  MailOutline,
  SettingsOutline,
  ShieldOutline,
  StackLayersOutline,
} from "@makeplane/propel/icons";
// types
import type { TSidebarMenuItem } from "./types";

export type TCoreSidebarMenuKey = "general" | "email" | "workspace" | "authentication" | "ai" | "image";

export const coreSidebarMenuLinks: Record<TCoreSidebarMenuKey, TSidebarMenuItem> = {
  general: {
    Icon: SettingsOutline,
    name: "General",
    href: `/general/`,
  },
  email: {
    Icon: MailOutline,
    name: "Mail",
    href: `/email/`,
  },
  workspace: {
    Icon: StackLayersOutline,
    name: "Workspaces",
    href: `/workspace/`,
  },
  authentication: {
    Icon: ShieldOutline,
    name: "Authentication",
    href: `/authentication/`,
  },
  ai: {
    Icon: AiStar1Outline,
    name: "AI",
    href: `/ai/`,
  },
  image: {
    Icon: ImageOutline,
    name: "Image",
    href: `/image/`,
  },
};
