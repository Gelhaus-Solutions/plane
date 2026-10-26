/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { CodeOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import type { TPQLError } from "./types";

const KEYWORDS = new Set(["and", "or", "not", "in", "is", "null", "empty", "between", "true", "false"]);
const TOKEN =
  /("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\d+(?:\.\d+)?[a-z]?)|(!=|>=|<=|=|>|<|~)|([A-Za-z_][\w.]*)(?=\s*\()|([A-Za-z_][\w.]*)|([()[\],])|(\s+)|(.)/g;

/** A PQL query coloured as the frames colour it: fields, operators and keywords, values, functions */
export function highlightPQL(text: string) {
  const parts: { text: string; className?: string }[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const [whole, string, number, operator, fn, word, punct] = match;
    let className: string | undefined;
    if (string !== undefined || number !== undefined) className = "text-syntax-value";
    else if (operator !== undefined) className = "text-syntax-operator";
    else if (fn !== undefined) className = "text-syntax-function";
    else if (word !== undefined)
      className = KEYWORDS.has(word.toLowerCase()) ? "text-syntax-operator" : "text-syntax-field";
    else if (punct !== undefined) className = "text-tertiary";
    parts.push({ text: whole, className });
  }
  return parts.map((part, i) =>
    part.className ? (
      // oxlint-disable-next-line react/no-array-index-key
      <span key={i} className={part.className}>
        {part.text}
      </span>
    ) : (
      part.text
    )
  );
}

export function PQLCode(props: { text: string; className?: string }) {
  return <span className={cn("font-code", props.className)}>{highlightPQL(props.text)}</span>;
}

type TEditorProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** How many items the query matches and how long that took, from the last preview */
  matched?: number;
  ms?: number;
  error?: TPQLError | null;
  autoFocus?: boolean;
};

const LINE = 22;

/** The widget editor's query box (r5-22): a header with the count, line numbers, and the query coloured as typed */
export function PQLEditor(props: TEditorProps) {
  const { value, onChange, label, placeholder, matched, ms, error, autoFocus } = props;
  const { t } = useTranslation();
  const codeRef = useRef<HTMLPreElement>(null);
  const lines = Math.max(3, value.split("\n").length);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-[10px] border border-strong bg-surface-2 focus-within:border-accent-strong focus-within:shadow-[0_0_0_3px_var(--bg-accent-subtle)]",
          { "border-danger-strong focus-within:border-danger-strong": !!error }
        )}
      >
        <div className="flex h-[30px] items-center gap-2 border-b border-subtle px-2.5 text-12 text-secondary">
          <CodeOutline className="size-[13px]" />
          PQL
          <span className="flex-1" />
          {matched !== undefined && (
            <span className="rounded-[5px] bg-layer-2 px-1.5 leading-5 tabular-nums">
              {t("dashboards.widget.items_count", { count: matched })}
            </span>
          )}
          {ms !== undefined && <span className="tabular-nums">{t("dashboards.editor.ms", { ms })}</span>}
        </div>
        <div className="flex font-code text-[12.5px]" style={{ lineHeight: `${LINE}px` }}>
          <div aria-hidden="true" className="w-7 flex-none py-1.5 pr-2 text-right text-tertiary select-none">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <pre
              ref={codeRef}
              aria-hidden="true"
              className="pointer-events-none m-0 py-1.5 pr-2.5 whitespace-pre text-primary"
            >
              {value ? highlightPQL(value) : <span className="text-placeholder">{placeholder}</span>}
              {"\n"}
            </pre>
            <textarea
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={autoFocus}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={(e) => {
                if (codeRef.current) codeRef.current.style.transform = `translateX(-${e.currentTarget.scrollLeft}px)`;
              }}
              aria-label={label}
              aria-invalid={!!error}
              spellCheck={false}
              wrap="off"
              rows={lines}
              className="absolute inset-0 resize-none overflow-x-auto overflow-y-hidden bg-transparent py-1.5 pr-2.5 whitespace-pre text-transparent outline-none"
              style={{ caretColor: "var(--txt-primary)", lineHeight: `${LINE}px` }}
            />
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-12 text-danger-primary">
          {error.position !== undefined
            ? t("dashboards.editor.error_at", { message: error.message, position: error.position + 1 })
            : error.message}
        </p>
      )}
    </div>
  );
}
