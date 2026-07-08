// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const postEntryMock = vi.fn();
const getGamesMock = vi.fn();
const paramsMock = { get: vi.fn() };
vi.mock("@/lib/api", () => ({ postEntry: postEntryMock, getGames: getGamesMock }));
vi.mock("next/navigation", () => ({ useSearchParams: () => paramsMock }));

const { default: ShareTarget } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  paramsMock.get.mockReturnValue(null);
  getGamesMock.mockResolvedValue({ ok: true, data: { games: [{ id: "wordle", name: "Wordle" }] } });
});

afterEach(() => {
  cleanup();
});

describe("/share-target", () => {
  it("posts the shared text to /api/entries and shows the friendly logged result", async () => {
    paramsMock.get.mockImplementation((k: string) => (k === "text" ? "Wordle 999 4/6" : null));
    postEntryMock.mockResolvedValue({
      ok: true,
      data: { ok: true, parsed: { gameId: "wordle", value: 4, solved: true, detail: null } },
    });
    render(<ShareTarget />);
    await waitFor(() => expect(postEntryMock).toHaveBeenCalledWith({ rawInput: "Wordle 999 4/6" }));
    const msg = await screen.findByText(/logged/i);
    expect(msg.textContent).toContain("Wordle");
    expect(msg.textContent).toContain("4/6 ✓");
  });

  it("shows a clear error (with a paste fallback link) when the result can't be read", async () => {
    paramsMock.get.mockImplementation((k: string) => (k === "text" ? "gibberish" : null));
    postEntryMock.mockResolvedValue({ ok: false, error: "Couldn't read that result", status: 422 });
    render(<ShareTarget />);
    expect(await screen.findByText(/couldn't read that result/i)).toBeTruthy();
    expect(screen.getByRole("link")).toBeTruthy(); // fallback to the paste page
  });

  it("shows an empty state and does NOT post when there's no shared text", async () => {
    paramsMock.get.mockReturnValue(null);
    render(<ShareTarget />);
    expect(await screen.findByText(/nothing to import/i)).toBeTruthy();
    expect(postEntryMock).not.toHaveBeenCalled();
  });
});
