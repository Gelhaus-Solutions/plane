/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Toast } from "@base-ui/react/toast";
import type { ToastObject } from "@base-ui/react/toast";
import {
  AlertCircleOutline,
  CloseOutline,
  InfoOutline,
  TickOutline,
  WarningTriangleOutline,
} from "@makeplane/propel/icons";
import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { UNDO_TIMEOUT, toastManager, undoLastChange, undoToast } from "./toast-manager";
import type { ToastAction, ToastData, ToastVariant } from "./toast-manager";

export type PlaneToastProviderProps = {
  children?: ReactNode;
  /** From md up, start the stack beside the app's 240 px sidebar instead of at the window's edge */
  besideSidebar?: boolean;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  success: <TickOutline className="size-4 text-success-primary" />,
  danger: <AlertCircleOutline className="size-4 text-danger-primary" />,
  warning: <WarningTriangleOutline className="size-4 text-warning-primary" />,
  info: <InfoOutline className="size-4 text-secondary" />,
  neutral: <InfoOutline className="size-4 text-secondary" />,
};

const BUTTON =
  "inline-flex h-6 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-strong bg-layer-1 px-2 text-12 font-medium whitespace-nowrap text-primary shadow-e1 transition-colors duration-[120ms] outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong";

// A field, an editor or a widget owns Cmd+Z; the global undo only takes it outside them
const ownsKeys = (target: EventTarget | null) =>
  target instanceof Element &&
  (target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest("[contenteditable=true], [role=textbox], [role=combobox], [role=dialog], [role=menu]") !== null);

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 animate-pulse-ring text-accent-primary">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ActionButton({ action }: { action: ToastAction }) {
  if (action.href != null)
    return (
      <a
        className={BUTTON}
        href={action.href}
        target={action.target}
        rel={action.target === "_blank" ? "noopener noreferrer" : undefined}
        onClick={action.onClick}
      >
        {action.label}
      </a>
    );
  return (
    <button type="button" className={BUTTON} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

function ToastItem({ toast }: { toast: ToastObject<ToastData> }) {
  const { t } = useTranslation();
  const data = toast.data;
  const actions = [...(data?.actions ?? []), ...(data?.primaryAction ? [data.primaryAction] : [])];
  const undo = data?.undo;
  const lead = data?.lead ?? (data?.loading ? <Spinner /> : VARIANT_ICON[data?.variant ?? "neutral"]);

  return (
    <Toast.Root
      toast={toast}
      swipeDirection={["left", "down"]}
      className={cn(
        "group/toast relative flex w-[420px] max-w-full items-center gap-2.5 overflow-hidden rounded-xl bg-popover py-[9px] pr-[9px] pl-3 text-[12.5px] leading-[1.4] shadow-e3 backdrop-blur-[14px] select-none",
        "transition-[opacity,transform] duration-[180ms] ease-pulse-out motion-reduce:transition-none",
        "data-[ending-style]:opacity-0 data-[limited]:hidden data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
        "data-[swipe-direction=down]:data-[ending-style]:translate-y-full data-[swipe-direction=left]:data-[ending-style]:-translate-x-full",
        data?.compact && "w-auto"
      )}
    >
      <span className="grid shrink-0 place-items-center">{lead}</span>
      <Toast.Content className="min-w-0 flex-1 select-text">
        <Toast.Title className={cn("block text-primary", data?.compact ? "font-normal" : "font-semibold")} />
        <Toast.Description className="block text-[11.5px] text-tertiary" />
      </Toast.Content>
      {undo && (
        <button type="button" className={BUTTON} onClick={() => undoToast(toast.id, undo)}>
          {t("toast_host.undo")}
          <kbd className="inline-flex h-4 items-center rounded-[4px] bg-layer-3 px-1 font-code text-10-5 font-medium text-secondary">
            {IS_MAC ? "⌘Z" : "Ctrl Z"}
          </kbd>
        </button>
      )}
      {actions.map((action) => (
        <ActionButton key={action.label} action={action} />
      ))}
      {data?.dismissable && (
        <Toast.Close
          aria-label={t("toast_host.dismiss")}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[7px] text-secondary transition-colors duration-[120ms] outline-none hover:bg-layer-1-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong"
        >
          <CloseOutline className="size-3.5" />
        </Toast.Close>
      )}
      {undo && (
        <span
          aria-hidden="true"
          style={{ "--toast-countdown": `${toast.timeout ?? UNDO_TIMEOUT}ms` } as CSSProperties}
          className="absolute bottom-0 left-0 h-0.5 w-full origin-left animate-toast-countdown bg-accent-primary group-data-[expanded]/toast:[animation-play-state:paused]"
        />
      )}
      {!undo && data?.progress !== undefined && (
        <span
          aria-hidden="true"
          style={{ width: `${Math.min(100, Math.max(0, data.progress))}%` }}
          className="absolute bottom-0 left-0 h-0.5 bg-accent-primary transition-[width] duration-[320ms]"
        />
      )}
    </Toast.Root>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager<ToastData>();
  // The manager keeps the newest first; the stack shows it at the bottom
  return toasts.toReversed().map((toast) => <ToastItem key={toast.id} toast={toast} />);
}

// Cmd+Z (Ctrl+Z) undoes the last undoable change, also after its toast is gone
function UndoShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || e.key.toLowerCase() !== "z") return;
      if (!(IS_MAC ? e.metaKey : e.ctrlKey)) return;
      if (ownsKeys(e.target)) return;
      if (undoLastChange()) e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

/**
 * The toast host (round 14, J5): toasts sit bottom left, beside the sidebar where the app has one, newest at the
 * bottom, at most three. They never block and never take focus.
 */
export function PlaneToastProvider({ children, besideSidebar = false }: PlaneToastProviderProps) {
  const { t } = useTranslation();

  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      {children}
      <UndoShortcut />
      <Toast.Portal>
        <Toast.Viewport
          aria-label={t("toast_host.notifications")}
          className={cn(
            "fixed bottom-4 left-4 z-60 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col items-start gap-2 outline-none",
            besideSidebar && "md:left-[256px]"
          )}
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
PlaneToastProvider.displayName = "blocks.PlaneToastProvider";
