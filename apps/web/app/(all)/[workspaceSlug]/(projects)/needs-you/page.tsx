/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// components
import { NeedsYouRoot } from "@/components/agents/needs-you/root";
import { PageHead } from "@/components/core/page-title";
import type { Route } from "./+types/page";

/** Needs you (E29): questions from agents and the work they finished into Review */
function NeedsYouPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();

  return (
    <>
      <PageHead title={t("agents.needs_you.title")} />
      <NeedsYouRoot workspaceSlug={workspaceSlug} />
    </>
  );
}

export default observer(NeedsYouPage);
