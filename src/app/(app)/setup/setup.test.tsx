// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const mintMock = vi.fn();
vi.mock("@/lib/api", () => ({ mintImportToken: mintMock, getMe: vi.fn() }));
vi.mock("@/lib/platform", () => ({ detectPlatform: () => "ios" }));

const { default: Setup } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => cleanup());

describe("/setup (iOS)", () => {
  it("shows the iPhone steps: add shortcut + copy key", () => {
    process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL = "https://www.icloud.com/shortcuts/abc";
    render(<Setup />);
    expect(screen.getByText(/add the bragboard shortcut/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy your key/i })).toBeTruthy();
  });

  it("Copy your key mints a token and copies it to the clipboard", async () => {
    mintMock.mockResolvedValue({ ok: true, data: { token: "key_xyz" } });
    render(<Setup />);
    fireEvent.click(screen.getByRole("button", { name: /copy your key/i }));
    await waitFor(() => expect(mintMock).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("key_xyz");
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it("uses the baked-in shortcut link when no env override is set", () => {
    delete process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL;
    render(<Setup />);
    const link = screen.getByRole("link", { name: /add the bragboard shortcut/i });
    expect(link.getAttribute("href")).toContain("icloud.com/shortcuts/");
  });
});
