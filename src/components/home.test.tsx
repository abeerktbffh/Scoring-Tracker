// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Home from "@/app/(app)/page";
import { getMe, getLeaderboard } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import type { MeResponse, OverallRow } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getMe: vi.fn(),
  getLeaderboard: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  loadName: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

const mockedGetMe = vi.mocked(getMe);
const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedLoadName = vi.mocked(loadName);

const meResponse: MeResponse = {
  today: {
    date: "2026-07-03",
    loggedCount: 3,
    totalCount: 5,
    games: [
      { gameId: "wordle", name: "Wordle", logged: true },
      { gameId: "connections", name: "Connections", logged: true },
      { gameId: "strands", name: "Strands", logged: true },
      { gameId: "pips", name: "Pips", logged: false },
      { gameId: "pinpoint", name: "Pinpoint", logged: false },
    ],
  },
  streaks: [
    { gameId: "wordle", name: "Wordle", currentStreak: 7, longestStreak: 12 },
    { gameId: "connections", name: "Connections", currentStreak: 3, longestStreak: 5 },
  ],
  recent: [],
};

const leaderboardRows: OverallRow[] = [
  { displayName: "DJ", wins: 18, gamesPlayed: 20, winRate: 0.9 },
  { displayName: "You", wins: 16, gamesPlayed: 19, winRate: 0.84 },
  { displayName: "Devanshi", wins: 14, gamesPlayed: 18, winRate: 0.78 },
];

beforeEach(() => {
  mockedGetMe.mockReset();
  mockedGetLeaderboard.mockReset();
  mockedLoadName.mockReset();
  mockedLoadName.mockReturnValue("You");
});

afterEach(() => {
  cleanup();
});

describe("Home", () => {
  it("shows skeletons while fetching", async () => {
    let resolveMe: (v: Awaited<ReturnType<typeof getMe>>) => void = () => {};
    mockedGetMe.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve;
      })
    );
    mockedGetLeaderboard.mockReturnValue(
      new Promise(() => {
        // never resolves for this assertion
      })
    );

    const { container } = render(<Home />);

    expect(container.querySelectorAll('[class*="skeleton"]').length).toBeGreaterThan(0);

    // resolve to avoid dangling state updates after the test ends
    resolveMe({ ok: true, data: meResponse });
  });

  it("renders today's status as N of M with a tile per game", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    const { container } = render(<Home />);

    await waitFor(() =>
      expect(container.textContent).toMatch(/3\s*of\s*5/i)
    );

    const tiles = container.querySelectorAll('[data-state]');
    expect(tiles.length).toBe(5);
    const solvedish = container.querySelectorAll('[data-state="solved"], [data-state="partial"]');
    expect(solvedish.length).toBe(3);
    const empty = container.querySelectorAll('[data-state="empty"]');
    expect(empty.length).toBe(2);
  });

  it("renders the standings snapshot with the user's row highlighted", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<Home />);

    await waitFor(() => expect(screen.getByText("DJ")).toBeTruthy());

    const youRow = screen.getByText("You").closest("tr");
    expect(youRow).toBeTruthy();
    expect(youRow?.className).toMatch(/me/i);
  });

  it("shows the user's best current streak via StreakBadge", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<Home />);

    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());
  });

  it("shows ErrorState on fetch failure and retries on click", async () => {
    mockedGetMe.mockResolvedValue({ ok: false, error: "Something went wrong — try again.", status: 500 });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    const { container } = render(<Home />);

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());

    expect(mockedGetMe).toHaveBeenCalledTimes(1);

    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(mockedGetMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toMatch(/3\s*of\s*5/i));
  });

  it("shows an EmptyState when there is no remembered name yet", async () => {
    mockedLoadName.mockReturnValue(null);
    mockedGetMe.mockResolvedValue({
      ok: true,
      data: { ...meResponse, today: { ...meResponse.today, loggedCount: 0, totalCount: 0, games: [] } },
    });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: [] },
    });

    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: /log today's puzzle/i })).toBeTruthy());
  });
});
