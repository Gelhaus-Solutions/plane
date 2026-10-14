/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ScrollArea } from "@makeplane/propel/components/scroll-area";
import { cn } from "@plane/utils";
// components
import { AppHeader } from "@/components/core/app-header";

type Props = {
  children: React.ReactNode;
  header?: React.ReactNode;
  hugging?: boolean;
};

export function SettingsContentWrapper(props: Props) {
  const { children, header, hugging = false } = props;

  return (
    <div className="@container flex size-full grow flex-col overflow-hidden">
      {header && (
        <div className="w-full shrink-0">
          <AppHeader header={header} />
        </div>
      )}
      <ScrollArea orientation="vertical">
        {/* Pulse settings: one centred column of 820 px (round 8, settings.py) */}
        <div
          className={cn("pt-[26px] pb-12", {
            "w-full px-page-x lg:px-12": hugging,
            "mx-auto w-full max-w-[820px] px-page-x md:px-8": !hugging,
          })}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
