/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plane/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PlaneToastProvider } from "../toast/plane-toast-provider";
import { setToast, toastManager, undoLastChange } from "../toast/toast-manager";

afterEach(() => {
  act(() => toastManager.close());
  // nothing undoable may leak into the next test
  undoLastChange();
});

describe("toast host", () => {
  it("offers Undo on an undoable change and runs it once", async () => {
    const undo = vi.fn();
    render(<PlaneToastProvider />);
    act(() => {
      setToast({ type: "success", title: "Moved 3 items to Done", undo });
    });

    fireEvent.click(await screen.findByRole("button", { name: /toast_host\.undo/ }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undoLastChange()).toBe(false);
  });

  it("undoes the last change from the keyboard, but not from a field", async () => {
    const undo = vi.fn();
    render(
      <PlaneToastProvider>
        <input aria-label="Title" />
      </PlaneToastProvider>
    );
    act(() => {
      setToast({ type: "success", title: "Moved 3 items to Done", undo });
    });
    await screen.findByText("Moved 3 items to Done");

    // jsdom is not a Mac, so the shortcut is Ctrl+Z
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "z", ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("lets a refusal be dismissed and leaves a plain success to time out", async () => {
    render(<PlaneToastProvider />);
    act(() => {
      setToast({ type: "success", title: "Saved" });
      setToast({ type: "error", title: "PLANE-60 needs an approval" });
    });
    // Base UI announces a high-priority toast in an alert region and hides the toast itself from the tree
    expect(await screen.findAllByLabelText("toast_host.dismiss")).toHaveLength(1);
    expect(screen.getByLabelText("toast_host.notifications").textContent).toContain("Saved");
  });

  it("shows the newest toast at the bottom", async () => {
    render(<PlaneToastProvider />);
    act(() => {
      setToast({ type: "info", title: "First" });
      setToast({ type: "info", title: "Second" });
    });
    await screen.findByText("Second");
    const viewport = screen.getByLabelText("toast_host.notifications");
    expect([...viewport.children].map((toast) => toast.textContent)).toEqual(["First", "Second"]);
  });
});
