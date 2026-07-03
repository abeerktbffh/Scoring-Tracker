// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Standings from "@/app/(app)/standings/page";
import { getLeaderboard, getBoard, getGames } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import type { OverallRow, GameBoardRow, Game } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getLeaderboard: vi.fn(),
  getBoard: vi.fn(),
  getGames: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  loadName: vi.fn(),
}));

const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedGetBoard = vi.mocked(getBoard);
const mockedGetGames = vi.mocked(getGames);
const mockedLoadName = vi.mocked(loadName);

const leaderboardRows: OverallRow[] = [
  { displayName: "DJ", wins: 18, gamesPlayed: 20, winRate: 0.9 },
  { displayName: "You", wins: 16, gamesPlayed: 19, winRate: 0.84 },
  { displayName: "Devanshi", wins: 14, gamesPlayed: 18, winRate: 0.78 },
];

const games: Game[] = [
  { id: "wordle", name: "Wordle", type: "outcome", metricDirection: "lower_better", hasVariants: false },
  { id: "pips", name: "Pips", type: "timed", metricDirection: "lower_better", hasVariants: true },
];

const boardRows: GameBoardRow[] = [
  { displayName: "You", wins: 9, gamesPlayed: 10, bestValue: 161, currentStreak: 5, longestStreak: 8 },
  { displayName: "DJ", wins: 7, gamesPlayed: 10, bestValue: 178, currentStreak: 2, longestStreak: 4 },
];

beforeEach(() => {
  mockedGetLeaderboard.mockReset();
  mockedGetBoard.mockReset();
  mockedGetGames.mockReset();
  mockedLoadName.mockReset();
  mockedLoadName.mockReturnValue("You");

  mockedGetLeaderboard.mockResolvedValue({
    ok: true,
    data: { window: "weekly", locked: false, players: leaderboardRows },
  });
  mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
  mockedGetBoard.mockResolvedValue({
    ok: true,
    data: { gameId: "wordle", window: "weekly", locked: false, players: boardRows },
  });
});

afterEach(() => {
  cleanup();
});

describe("Standings", () => {
  it("refetches the overall leaderboard with the new window when Segmented changes", async () => {
    render(<Standings />);

    await waitFor(() => expect(screen.getByText("DJ")).toBeTruthy());
    expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", "You");

    fireEvent.click(screen.getByRole("button", { name: "Daily" }));

    await waitFor(() => expect(mockedGetLeaderboard).toHaveBeenCalledWith("daily", "You"));
  });

  it("loads a game's board when its Chip is selected", async () => {
    render(<Standings />);

    await waitFor(() => expect(screen.getByText("Wordle")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Pips" }));

    await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledWith("pips", "weekly", "You"));
  });

  it("renders LockedState instead of the table when the leaderboard is locked", async () => {
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "daily", locked: true, players: [] },
    });

    const { container } = render(<Standings />);

    await waitFor(() =>
      expect(screen.getByText(/log today's puzzle to reveal today's standings/i)).toBeTruthy()
    );

    const overallCard = container.querySelector('[class*="wrap"] > [class*="card"]');
    expect(overallCard?.querySelector("table")).toBeNull();
  });
});
