/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Toast } from "@base-ui/react/toast";
import type { MouseEventHandler, ReactNode } from "react";

/**
 * The toasts of round 14 (J5): bottom left, newest at the bottom, at most three. They never block and never take
 * focus. A change that can be undone shows Undo with Cmd+Z for 8 seconds, and Cmd+Z still undoes it after the toast
 * is gone; a refusal (an error) stays until it is dismissed; a small toast is one line for 2 seconds.
 */

export type ToastType = "success" | "error" | "info" | "warning" | "loading" | "loading-toast";

/** The status a toast shows with its lead icon */
export type ToastVariant = "success" | "danger" | "warning" | "info" | "neutral";

/** A button on a toast, declared as data: a label with a handler, or a label with a link */
export type ToastAction = {
  /** Visible text, also the accessible name */
  label: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Renders the action as a link; use it for other tabs and other sites, onClick for in-app navigation */
  href?: string;
  /** Only with href; "_blank" also sets rel="noopener noreferrer" */
  target?: "_self" | "_blank";
};

export type ToastActionItem = ToastAction & {
  /** Put this item last, after the others; only the first flagged item counts */
  primary?: boolean;
};

export type ToastData = {
  variant: ToastVariant;
  /** Up to two actions */
  actions?: ToastAction[];
  /** The action shown last */
  primaryAction?: ToastAction;
  /** A spinner in place of the status icon, for work that runs until the toast is updated */
  loading?: boolean;
  /** Completion of server work from 0 to 100, as a bar along the bottom */
  progress?: number;
  /** Shown in place of the status icon, for example an agent's avatar */
  lead?: ReactNode;
  /** Undo button with Cmd+Z, and a bar that counts down the time it stays */
  undo?: () => void;
  /** One line without a title weight, gone after 2 seconds */
  compact?: boolean;
  /** Stays until closed, so it shows a dismiss button: refusals and running work */
  dismissable?: boolean;
};

const MAX_LEFT_ACTIONS = 2;
/** How long an undoable change offers Undo */
export const UNDO_TIMEOUT = 8000;
const COMPACT_TIMEOUT = 2000;
const WARNING_TIMEOUT = 8000;

type ToastExtras = {
  /** Completion of server work from 0 to 100 */
  progress?: number;
  /** Shown in place of the status icon */
  lead?: ReactNode;
  /** Makes the change undoable: an Undo button with Cmd+Z for 8 seconds, and Cmd+Z afterwards */
  undo?: () => void;
  /** One line for 2 seconds, such as "Copied PLANE-91" */
  compact?: boolean;
};

export type SetToastProps =
  | ({
      type: "loading";
      title?: string;
    } & Pick<ToastExtras, "progress" | "lead">)
  | ({
      id?: string | number;
      type: Exclude<ToastType, "loading">;
      title: string;
      message?: string;
      /**
       * Prefer `ToastActionItem[]`, which renders as buttons and links. The `ReactNode` arm only exists so older
       * call sites keep compiling; markup cannot be rendered inside a toast and is dropped.
       */
      actionItems?: ReactNode | ToastActionItem[];
    } & ToastExtras);

type PromiseToastCallback<TData> = (data: TData) => string | undefined;
type ActionItemsPromiseToastCallback<TData> = (data: TData) => ReactNode | ToastActionItem[];

export type PromiseToastData<TData> = {
  title: string;
  message?: PromiseToastCallback<TData>;
  actionItems?: ActionItemsPromiseToastCallback<TData>;
};

export type PromiseToastOptions<TData> = {
  loading?: string;
  success: PromiseToastData<TData>;
  error: PromiseToastData<TData>;
};

const DEFAULT_LOADING_TITLE = "Loading...";

const VARIANT_BY_TYPE: Record<ToastType, ToastVariant> = {
  success: "success",
  error: "danger",
  warning: "warning",
  info: "info",
  loading: "neutral",
  "loading-toast": "neutral",
};

// Safely detects a non-production build without requiring @types/node. Evaluated once at module
// load time; bundlers can tree-shake the dev blocks.
const __DEV__ = (() => {
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
  return proc ? proc.env?.NODE_ENV !== "production" : false;
})();

const isLoading = (type: ToastType) => type === "loading" || type === "loading-toast";

/**
 * How long a toast stays and how urgently it is announced. Loading toasts and refusals stay until they are closed;
 * the rest use the host's default (5 seconds) unless they are undoable, small or a warning.
 */
const timingFor = (type: ToastType, extras: ToastExtras = {}): { timeout?: number; priority?: "high" } => {
  if (isLoading(type)) return { timeout: 0 };
  if (type === "error") return { timeout: 0, priority: "high" };
  if (extras.undo) return { timeout: UNDO_TIMEOUT };
  if (extras.compact) return { timeout: COMPACT_TIMEOUT };
  if (type === "warning") return { timeout: WARNING_TIMEOUT, priority: "high" };
  return {};
};

const isToastActionItem = (value: unknown): value is ToastActionItem =>
  typeof value === "object" && value !== null && typeof (value as ToastActionItem).label === "string";

const describeActionItems = (actionItems: unknown): string => {
  if (Array.isArray(actionItems)) return `an array of ${actionItems.length} non-action value(s)`;
  return `a value of type ${typeof actionItems}`;
};

const toActionSlots = (
  actionItems: ReactNode | ToastActionItem[]
): { actions?: ToastActionItem[]; primaryAction?: ToastActionItem } => {
  // The ReactNode values that render nothing: the caller meant "no actions", not a mistake.
  if (actionItems == null || actionItems === false || actionItems === "") return {};
  if (Array.isArray(actionItems)) {
    if (actionItems.length === 0) return {};
    if (actionItems.every(isToastActionItem)) {
      const primaryIndex = actionItems.findIndex((item) => item.primary === true);
      const primaryAction = primaryIndex >= 0 ? actionItems[primaryIndex] : undefined;
      const left = primaryIndex >= 0 ? actionItems.filter((_, i) => i !== primaryIndex) : [...actionItems];

      if (__DEV__ && left.length > MAX_LEFT_ACTIONS) {
        console.warn(
          `[@plane/blocks/toast] Toast passed ${actionItems.length} action items but a toast shows ` +
            `at most ${MAX_LEFT_ACTIONS} plus one \`primary\` item. ` +
            `Dropping: ${left
              .slice(MAX_LEFT_ACTIONS)
              .map((item) => JSON.stringify(item.label))
              .join(", ")}. Mark one item \`primary: true\` or merge two of them.`
        );
      }

      return {
        actions: left.length > 0 ? left.slice(0, MAX_LEFT_ACTIONS) : undefined,
        primaryAction,
      };
    }
  }
  if (__DEV__) {
    console.warn(
      `[@plane/blocks/toast] Dropped \`actionItems\`: got ${describeActionItems(actionItems)}. ` +
        "A toast renders actions as data, not markup, so JSX action items cannot be shown. " +
        'Pass `ToastActionItem[]` instead, e.g. [{ label: "View cycle", href: "/..." }] or ' +
        '[{ label: "View cycle", onClick }].'
    );
  }
  return {};
};

const toastDataFor = (type: ToastType, actionItems?: ReactNode | ToastActionItem[], extras: ToastExtras = {}) => {
  const data: ToastData = { variant: VARIANT_BY_TYPE[type], ...toActionSlots(actionItems) };
  if (isLoading(type)) data.loading = true;
  if (isLoading(type) || type === "error") data.dismissable = true;
  if (extras.progress !== undefined) data.progress = extras.progress;
  if (extras.lead !== undefined) data.lead = extras.lead;
  if (extras.undo) data.undo = extras.undo;
  if (extras.compact) data.compact = true;
  return data;
};

export const toastManager = Toast.createToastManager<ToastData>();

// The last undoable change. Cmd+Z undoes it while its toast shows and after it is gone, until a newer one replaces it.
let lastUndo: { id: string; run: () => void } | null = null;

const rememberUndo = (id: string, run: (() => void) | undefined) => {
  if (run) lastUndo = { id, run };
  else if (lastUndo?.id === id) lastUndo = null;
};

/** Undoes a toast's change: from its Undo button, or with Cmd+Z for the last one. */
export const undoToast = (id: string, run: () => void): void => {
  if (lastUndo?.id === id) lastUndo = null;
  toastManager.close(id);
  run();
};

/** Undoes the last undoable change (Cmd+Z). Returns whether there was one. */
export const undoLastChange = (): boolean => {
  if (!lastUndo) return false;
  const { id, run } = lastUndo;
  undoToast(id, run);
  return true;
};

export const setToast = (props: SetToastProps): string => {
  if (props.type === "loading") {
    return toastManager.add({
      title: props.title ?? DEFAULT_LOADING_TITLE,
      ...timingFor(props.type),
      data: toastDataFor(props.type, undefined, props),
    });
  }
  const id = toastManager.add({
    id: props.id?.toString(),
    title: props.title,
    description: props.message,
    ...timingFor(props.type, props),
    data: toastDataFor(props.type, props.actionItems, props),
  });
  rememberUndo(id, props.undo);
  return id;
};

export const updateToast = (id: string, props: SetToastProps): void => {
  if (props.type === "loading") {
    toastManager.update(id, {
      title: props.title ?? DEFAULT_LOADING_TITLE,
      ...timingFor(props.type),
      data: toastDataFor(props.type, undefined, props),
    });
    return;
  }
  toastManager.update(id, {
    title: props.title,
    description: props.message,
    ...timingFor(props.type, props),
    data: toastDataFor(props.type, props.actionItems, props),
  });
  rememberUndo(id, props.undo);
};

export const setPromiseToast = <TData>(promise: Promise<TData>, options: PromiseToastOptions<TData>): void => {
  void toastManager.promise(promise, {
    loading: {
      title: options.loading ?? DEFAULT_LOADING_TITLE,
      ...timingFor("loading"),
      data: toastDataFor("loading"),
    },
    success: (data: TData) => ({
      title: options.success.title,
      description: options.success.message?.(data),
      ...timingFor("success"),
      data: toastDataFor("success", options.success.actionItems?.(data)),
    }),
    // Matches the previous module: the error callbacks are typed against the resolved value.
    error: (error: TData) => ({
      title: options.error.title,
      description: options.error.message?.(error),
      ...timingFor("error"),
      data: toastDataFor("error", options.error.actionItems?.(error)),
    }),
  });
};

export const dismissToast = (tId: string): void => {
  toastManager.close(tId);
};
