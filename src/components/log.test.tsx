// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Log from "@/app/(app)/log/page";
import { getGames, getMe, postEntry } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import type { Game, MeResponse } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGames: vi.fn(),
  getMe: vi.fn(),
  postEntry: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  loadName: vi.fn(),
}));

const mockedGetGames = vi.mocked(getGames);
const mockedGetMe = vi.mocked(getMe);
const mockedPostEntry = vi.mocked(postEntry);
const mockedLoadName = vi.mocked(loadName);

const games: Game[] = [
  { id: "wordle", name: "Wordle", type: "outcome", metricDirection: "lower_better", hasVariants: false },
  { id: "mini", name: "NYT Mini", type: "timed", metricDirection: "lower_better", hasVariants: true },
];

const meResponse: MeResponse = {
  today: {
    date: "2026-07-03",
    loggedCount: 1,
    totalCount: 2,
    games: [
      { gameId: "wordle", name: "Wordle", logged: true },
      { gameId: "mini", name: "NYT Mini", logged: false },
    ],
  },
  streaks: [],
  recent: [],
};

beforeEach(() => {
  mockedGetGames.mockReset();
  mockedGetMe.mockReset();
  mockedPostEntry.mockReset();
  mockedLoadName.mockReset();
  mockedLoadName.mockReturnValue("You");
  mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
  mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
});

afterEach(() => {
  cleanup();
});

describe("Log", () => {
  it("has no name or PIN inputs — identity comes from the session", async () => {
    render(<Log />);

    await waitFor(() => expect(mockedGetGames).toHaveBeenCalled());

    expect(screen.queryByLabelText(/pin/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/who are you/i)).toBeNull();
  });

  it("pastes text and submits, calling postEntry with only rawInput; clears + confirms on success", async () => {
    mockedPostEntry.mockResolvedValue({
      ok: true,
      data: { ok: true, parsed: { gameId: "wordle", value: 3 } },
    });

    render(<Log />);

    await waitFor(() => expect(mockedGetGames).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(/paste/i);
    fireEvent.change(textarea, { target: { value: "Wordle 1,234 3/6\n⬛🟨⬛⬛⬛\n🟩🟩🟩🟩🟩" } });

    fireEvent.click(screen.getByRole("button", { name: /log it/i }));

    await waitFor(() =>
      expect(mockedPostEntry).toHaveBeenCalledWith({
        rawInput: "Wordle 1,234 3/6\n⬛🟨⬛⬛⬛\n🟩🟩🟩🟩🟩",
      })
    );

    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(""));
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
  });

  it("shows the friendly parse error on a 422 and keeps the pasted text", async () => {
    mockedPostEntry.mockResolvedValue({
      ok: false,
      error: "Couldn't read that — check the format.",
      status: 422,
    });

    render(<Log />);

    await waitFor(() => expect(mockedGetGames).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(/paste/i);
    fireEvent.change(textarea, { target: { value: "garbage input" } });
    fireEvent.click(screen.getByRole("button", { name: /log it/i }));

    await waitFor(() => expect(screen.getByText(/couldn't read that/i)).toBeTruthy());
    expect((textarea as HTMLTextAreaElement).value).toBe("garbage input");
  });

  it("manual mode: picking a game then submitting calls postEntry with only gameId/value/solved", async () => {
    mockedPostEntry.mockResolvedValue({
      ok: true,
      data: { ok: true, parsed: { gameId: "wordle", value: 4 } },
    });

    render(<Log />);

    await waitFor(() => expect(screen.getByText("Wordle")).toBeTruthy());

    fireEvent.click(screen.getByText("Wordle"));

    const valueInput = screen.getByLabelText(/value/i);
    fireEvent.change(valueInput, { target: { value: "4" } });

    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() =>
      expect(mockedPostEntry).toHaveBeenCalledWith({
        gameId: "wordle",
        value: 4,
        solved: false,
      })
    );
  });
});
