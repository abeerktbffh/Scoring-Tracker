// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Home from "@/app/(app)/page";
import { getMe, getLeaderboard } from "@/lib/api";
import { useBoard } from "@/components/BoardContext";
import type { MeResponse, OverallRow } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getMe: vi.fn(),
  getLeaderboard: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/components/BoardContext", () => ({
  useBoard: vi.fn(),
}));

const mockedGetMe = vi.mocked(getMe);
const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedUseBoard = vi.mocked(useBoard);

// Viewer identity now comes from the server (me.displayName / leaderboard's
// viewerName), never from localStorage — these fixtures reflect that.
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
  todayDetail: [],
  streaks: [
    { gameId: "wordle", name: "Wordle", currentStreak: 7, longestStreak: 12 },
    { gameId: "connections", name: "Connections", currentStreak: 3, longestStreak: 5 },
  ],
  recent: [],
  displayName: "You",
};

const leaderboardRows: OverallRow[] = [
  { displayName: "DJ", gold: 18, silver: 0, bronze: 0, gamesPlayed: 20, gamesLed: [] },
  { displayName: "You", gold: 16, silver: 0, bronze: 0, gamesPlayed: 19, gamesLed: [] },
  { displayName: "Devanshi", gold: 14, silver: 0, bronze: 0, gamesPlayed: 18, gamesLed: [] },
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
  mockedGetMe.mockReset();
  mockedGetLeaderboard.mockReset();
  mockedUseBoard.mockReset();
  setBoard(null);
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
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
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

  it("renders the standings snapshot with the user's row highlighted, identified via the server-provided displayName", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
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
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
    });

    render(<Home />);

    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());
  });

  it("shows ErrorState on fetch failure and retries on click", async () => {
    mockedGetMe.mockResolvedValue({ ok: false, error: "Something went wrong — try again.", status: 500 });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
    });

    const { container } = render(<Home />);

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());

    expect(mockedGetMe).toHaveBeenCalledTimes(1);

    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(mockedGetMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toMatch(/3\s*of\s*5/i));
  });

  it("shows an EmptyState when nothing has been logged yet (totalCount 0), independent of viewer identity", async () => {
    mockedGetMe.mockResolvedValue({
      ok: true,
      data: {
        ...meResponse,
        today: { ...meResponse.today, loggedCount: 0, totalCount: 0, games: [] },
        // A brand-new user has no display name recorded yet either.
        displayName: null,
      },
    });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: [], viewerName: null },
    });

    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: /log today's puzzle/i })).toBeTruthy());
  });

  describe("viewer identity for a brand-new user (no localStorage name)", () => {
    // Regression guard: Home no longer reads localStorage for viewer identity
    // at all — it must identify "me" purely from the server-provided
    // displayName, which is what a freshly-onboarded user has instead of a
    // localStorage entry (only ever written by the rename flow).
    it("highlights the viewer's row using me.displayName even though nothing was ever written to localStorage", async () => {
      mockedGetMe.mockResolvedValue({ ok: true, data: { ...meResponse, displayName: "Devanshi" } });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "Devanshi" },
      });

      render(<Home />);

      await waitFor(() => expect(screen.getByText("Devanshi")).toBeTruthy());
      const myRow = screen.getByText("Devanshi").closest("tr");
      expect(myRow?.className).toMatch(/me/i);
    });
  });

  describe("group-aware empty state", () => {
    it("shows a group-specific empty state when the selected group tracks no games", async () => {
      setBoard("g1");
      mockedGetMe.mockResolvedValue({
        ok: true,
        data: { ...meResponse, today: { ...meResponse.today, loggedCount: 0, totalCount: 0, games: [] } },
      });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: [], viewerName: "You" },
      });

      render(<Home />);

      await waitFor(() => expect(screen.getByText(/no games tracked/i)).toBeTruthy());
      expect(screen.getByText(/this group isn't tracking any games yet/i)).toBeTruthy();
      expect(screen.queryByText(/nothing logged yet/i)).toBeNull();
      expect(screen.queryByRole("button", { name: /log today's puzzle/i })).toBeNull();
    });

    it("shows the Today card (not the full empty state) for a group that tracks games but the viewer hasn't logged today", async () => {
      setBoard("g1");
      mockedGetMe.mockResolvedValue({
        ok: true,
        data: {
          ...meResponse,
          today: {
            ...meResponse.today,
            loggedCount: 0,
            games: meResponse.today.games.map((g) => ({ ...g, logged: false })),
          },
        },
      });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: [], viewerName: "You" },
      });

      const { container } = render(<Home />);

      await waitFor(() => expect(container.textContent).toMatch(/0\s*of\s*5/i));
      expect(screen.queryByText(/nothing logged yet/i)).toBeNull();
      expect(screen.queryByText(/no games tracked/i)).toBeNull();
    });

    it("keeps the existing global first-run copy when the global board's catalog is empty", async () => {
      setBoard(null);
      mockedGetMe.mockResolvedValue({
        ok: true,
        data: {
          ...meResponse,
          today: { ...meResponse.today, loggedCount: 0, totalCount: 0, games: [] },
          displayName: null,
        },
      });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: [], viewerName: null },
      });

      render(<Home />);

      await waitFor(() => expect(screen.getByRole("button", { name: /log today's puzzle/i })).toBeTruthy());
      expect(screen.getByText(/nothing logged yet/i)).toBeTruthy();
    });
  });

  describe("board scoping", () => {
    beforeEach(() => {
      mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
      });
    });

    it("calls getMe/getLeaderboard with undefined group when Global", async () => {
      setBoard(null);

      render(<Home />);

      await waitFor(() => expect(mockedGetMe).toHaveBeenCalledWith("", undefined));
      expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", undefined, undefined);
    });

    it("calls getMe/getLeaderboard with the selected group id", async () => {
      setBoard("g1");

      render(<Home />);

      await waitFor(() => expect(mockedGetMe).toHaveBeenCalledWith("", "g1"));
      expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", undefined, "g1");
    });

    it("refetches when the selected board changes", async () => {
      setBoard(null);

      const { rerender } = render(<Home />);

      await waitFor(() => expect(mockedGetMe).toHaveBeenCalledWith("", undefined));

      setBoard("g2");
      rerender(<Home />);

      await waitFor(() => expect(mockedGetMe).toHaveBeenCalledWith("", "g2"));
      expect(mockedGetLeaderboard).toHaveBeenCalledWith("weekly", undefined, "g2");
    });
  });
});
