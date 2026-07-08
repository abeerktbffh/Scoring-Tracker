// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const mintMock = vi.fn();
const getMeMock = vi.fn();
vi.mock("@/lib/api", () => ({ mintImportToken: mintMock, getMe: getMeMock }));
vi.mock("@/lib/platform", () => ({ detectPlatform: () => "ios" }));

const { default: Setup } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => cleanup());

describe("/setup (iOS)", () => {
  it("shows the iPhone steps: copy key appears before add shortcut in DOM order", () => {
    process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL = "https://www.icloud.com/shortcuts/abc";
    render(<Setup />);
    const copyKeyBtn = screen.getByRole("button", { name: /copy your key/i });
    const addShortcutLink = screen.getByText(/add the bragboard shortcut/i);
    expect(copyKeyBtn).toBeTruthy();
    expect(addShortcutLink).toBeTruthy();
    // Copy your key must come before Add the shortcut in DOM order.
    const position = copyKeyBtn.compareDocumentPosition(addShortcutLink);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Copy your key mints a token and copies it to the clipboard", async () => {
    mintMock.mockResolvedValue({ ok: true, data: { token: "key_xyz" } });
    render(<Setup />);
    fireEvent.click(screen.getByRole("button", { name: /copy your key/i }));
    await waitFor(() => expect(mintMock).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("key_xyz");
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it("Check that it worked shows the viewer's latest logged result", async () => {
    getMeMock.mockResolvedValue({
      ok: true,
      data: { displayName: "Dev", recent: [{ gameId: "wordle", value: 4, solved: true, detail: null, puzzleDate: "2026-07-08" }] },
    });
    render(<Setup />);
    fireEvent.click(screen.getByRole("button", { name: /check that it worked/i }));
    await waitFor(() => expect(getMeMock).toHaveBeenCalled());
    expect(await screen.findByText(/wordle/i)).toBeTruthy();
  });

  it("uses the baked-in shortcut link when no env override is set", () => {
    delete process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL;
    render(<Setup />);
    const link = screen.getByRole("link", { name: /add the bragboard shortcut/i });
    expect(link.getAttribute("href")).toContain("icloud.com/shortcuts/");
  });
});

describe("/setup (Android)", () => {
  it("shows an Install app button and triggers a captured install prompt", async () => {
    vi.resetModules();
    vi.doMock("@/lib/platform", () => ({ detectPlatform: () => "android" }));
    const { default: SetupA } = await import("./page");
    render(<SetupA />);
    const promptFn = vi.fn().mockResolvedValue(undefined);
    // Simulate Chrome firing beforeinstallprompt
    const evt: any = new Event("beforeinstallprompt");
    evt.prompt = promptFn;
    window.dispatchEvent(evt);
    const btn = await screen.findByRole("button", { name: /install app/i });
    fireEvent.click(btn);
    await waitFor(() => expect(promptFn).toHaveBeenCalled());
  });
});
