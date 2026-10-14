/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { download, generateCsv, mkConfig } from "export-to-csv";

/** What Export CSV writes: the open tab's main table, one object per row keyed by the column names */
export type TExportTable = { name: string; rows: Record<string, string | number>[] };

type TExportContext = { set: (table: TExportTable | null) => void; get: () => TExportTable | null };

const ExportContext = createContext<TExportContext | null>(null);

export function InsightsExportProvider(props: { children: ReactNode }) {
  const table = useRef<TExportTable | null>(null);
  const value = useMemo<TExportContext>(
    () => ({
      set: (next) => {
        table.current = next;
      },
      get: () => table.current,
    }),
    []
  );
  return <ExportContext.Provider value={value}>{props.children}</ExportContext.Provider>;
}

/** A tab hands its table to Export CSV while it is open */
export function useExportTable(table: TExportTable | null) {
  const context = useContext(ExportContext);
  useEffect(() => {
    context?.set(table);
    return () => context?.set(null);
  }, [context, table]);
}

export function useExportCsv() {
  const context = useContext(ExportContext);
  return () => {
    const table = context?.get();
    if (!table || !table.rows.length) return;
    const config = mkConfig({
      filename: table.name,
      useKeysAsHeaders: true,
      fieldSeparator: ",",
      decimalSeparator: ".",
    });
    download(config)(generateCsv(config)(table.rows));
  };
}
