// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Standings from "@/app/(app)/standings/page";
import { getLeaderboard, getBoard, getGames } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import { useBoard } from "@/components/BoardContext";
import type { OverallRow, GameBoardRow, Game } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getLeaderboard: vi.fn(),
  getBoard: vi.fn(),
  getGames: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  loadName: vi.fn(),
}));

vi.mock("@/components/BoardContext", () => ({
  useBoard: vi.fn(),
}));

const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedGetBoard = vi.mocked(getBoard);
const mockedGetGames = vi.mocked(getGames);
const mockedLoadName = vi.mocked(loadName);
const mockedUseBoard = vi.mocked(useBoard);

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

function setBoard(boardId: string | null) {
  mockedUseBoard.mockReturnValue({
    boardId,
    board: null,
    groups: [],
    loading: false,
    select: vi.fn(),
    refresh: vi.fn(),
  });
}

beforeEach(() => {
  mockedGetLeaderboard.mockReset();
  mockedGetBoard.mockReset();
  mockedGetGames.mockReset();
  mockedLoadName.mockReset();
  mockedLoadName.mockReturnValue("You");
  mockedUseBoard.mockReset();
  setBoard(null);

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
    expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", "You", undefined);

    fireEvent.click(screen.getByRole("button", { name: "Daily" }));

    await waitFor(() => expect(mockedGetLeaderboard).toHaveBeenCalledWith("daily", "You", undefined));
  });

  it("loads a game's board when its Chip is selected", async () => {
    render(<Standings />);

    await waitFor(() => expect(screen.getByText("Wordle")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Pips" }));

    await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledWith("pips", "weekly", "You", undefined));
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

  describe("board scoping", () => {
    it("calls getLeaderboard/getGames with the selected group id", async () => {
      setBoard("g1");

      render(<Standings />);

      await waitFor(() => expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", "You", "g1"));
      expect(mockedGetGames).toHaveBeenCalledWith("g1");
    });

    it("calls getBoard with the selected group id once a game is auto-selected", async () => {
      setBoard("g1");

      render(<Standings />);

      await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledWith("wordle", "weekly", "You", "g1"));
    });

    it("re-selects the first game of the new board when boardId changes", async () => {
      setBoard(null);

      const gamesG2: Game[] = [
        { id: "connections", name: "Connections", type: "outcome", metricDirection: "lower_better", hasVariants: false },
      ];

      const { rerender } = render(<Standings />);

      await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledWith("wordle", "weekly", "You", undefined));

      mockedGetGames.mockResolvedValue({ ok: true, data: { games: gamesG2 } });
      mockedGetBoard.mockResolvedValue({
        ok: true,
        data: { gameId: "connections", window: "weekly", locked: false, players: boardRows },
      });
      setBoard("g2");
      rerender(<Standings />);

      await waitFor(() => expect(mockedGetGames).toHaveBeenCalledWith("g2"));
      await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledWith("connections", "weekly", "You", "g2"));
      expect(mockedGetBoard).not.toHaveBeenCalledWith("wordle", "weekly", "You", "g2");
    });

    it("refetches the overall leaderboard when boardId changes", async () => {
      setBoard(null);

      const { rerender } = render(<Standings />);

      await waitFor(() => expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", "You", undefined));

      setBoard("g2");
      rerender(<Standings />);

      await waitFor(() => expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", "You", "g2"));
    });

    it("does not keep showing the previous board's game table while the new board's own board is still loading", async () => {
      setBoard("g1");
      const staleRows: GameBoardRow[] = [
        { displayName: "StaleG1Player", wins: 1, gamesPlayed: 1, bestValue: 1, currentStreak: 1, longestStreak: 1 },
      ];
      mockedGetBoard.mockResolvedValue({
        ok: true,
        data: { gameId: "wordle", window: "weekly", locked: false, players: staleRows },
      });

      const { rerender } = render(<Standings />);
      await waitFor(() => expect(screen.getByText("StaleG1Player")).toBeTruthy());

      // Switch to a board that tracks a different (nonzero) set of games, but delay
      // its getBoard response so the old board would still be "ready" if it weren't reset.
      const gamesG2: Game[] = [
        {
          id: "connections",
          name: "Connections",
          type: "outcome",
          metricDirection: "lower_better",
          hasVariants: false,
        },
      ];
      mockedGetGames.mockResolvedValue({ ok: true, data: { games: gamesG2 } });
      let resolveBoard: (value: Awaited<ReturnType<typeof getBoard>>) => void = () => {};
      mockedGetBoard.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveBoard = resolve;
          })
      );

      setBoard("g2");
      rerender(<Standings />);

      await waitFor(() => expect(screen.getByRole("button", { name: "Connections" })).toBeTruthy());
      // The new group's board hasn't resolved yet — the old group's stale rows must not show.
      expect(screen.queryByText("StaleG1Player")).toBeNull();

      resolveBoard({
        ok: true,
        data: { gameId: "connections", window: "weekly", locked: false, players: [] },
      });
    });

    it("shows 'No games yet' instead of a stale board when switching to a board with zero tracked games", async () => {
      setBoard("g1");
      const staleRows: GameBoardRow[] = [
        { displayName: "StaleG1Player", wins: 1, gamesPlayed: 1, bestValue: 1, currentStreak: 1, longestStreak: 1 },
      ];
      mockedGetBoard.mockResolvedValue({
        ok: true,
        data: { gameId: "wordle", window: "weekly", locked: false, players: staleRows },
      });

      const { rerender } = render(<Standings />);
      await waitFor(() => expect(screen.getByText("StaleG1Player")).toBeTruthy());

      mockedGetGames.mockResolvedValue({ ok: true, data: { games: [] } });
      setBoard("g2");
      rerender(<Standings />);

      await waitFor(() => expect(screen.getByText(/no games yet/i)).toBeTruthy());
      expect(screen.queryByText("StaleG1Player")).toBeNull();
    });
  });
});
