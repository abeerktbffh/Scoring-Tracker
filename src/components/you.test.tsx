// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import You from "@/app/(app)/you/page";
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

const mockedGetMe = vi.mocked(getMe);
const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedLoadName = vi.mocked(loadName);

const today = "2026-07-03";
const yesterday = "2026-07-02";

const meResponse: MeResponse = {
  today: { date: today, loggedCount: 3, totalCount: 5, games: [] },
  streaks: [
    { gameId: "wordle", name: "Wordle", currentStreak: 7, longestStreak: 12 },
    { gameId: "pips", name: "Pips", currentStreak: 4, longestStreak: 4 },
    { gameId: "connections", name: "Connections", currentStreak: 0, longestStreak: 2 },
  ],
  recent: [
    { gameId: "wordle", name: "Wordle", variant: null, value: 3, solved: true, puzzleDate: today },
    { gameId: "pips", name: "Pips", variant: "Hard", value: 72, solved: true, puzzleDate: today },
    { gameId: "mini", name: "Mini", variant: null, value: 48, solved: true, puzzleDate: yesterday },
  ],
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

describe("You", () => {
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

    const { container } = render(<You />);

    expect(container.querySelectorAll('[class*="skeleton"]').length).toBeGreaterThan(0);

    resolveMe({ ok: true, data: meResponse });
  });

  it("renders the avatar initial, name, and rank from the leaderboard", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    const { container } = render(<You />);

    await waitFor(() => expect(screen.getAllByText("You").length).toBeGreaterThan(0));

    // Initial "Y" for "You" shown in the avatar
    expect(container.textContent).toMatch(/Y/);
    // Rank: "You" is 2nd by wins (18, 16, 14)
    expect(container.textContent).toMatch(/#2/);
  });

  it("renders the three StatCards: wins, best streak, win rate", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText("16")).toBeTruthy()); // wins
    expect(screen.getByText("12")).toBeTruthy(); // best streak = max longestStreak across streaks (12, 4, 2)
    expect(screen.getByText("84%")).toBeTruthy(); // win rate
  });

  it("renders a per-game streak list from me.streaks with StreakBadge", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    const { container } = render(<You />);

    await waitFor(() => expect(container.querySelectorAll("li").length).toBeGreaterThan(0));

    const streakItems = Array.from(container.querySelectorAll("li")).filter((li) =>
      /Wordle|Pips|Connections/.test(li.textContent ?? "")
    );
    // Only the streak-list <li>s should match by exact game name (recent list has "Pips Hard")
    const wordleRow = streakItems.find((li) => li.textContent?.trim().startsWith("Wordle"));
    const connectionsRow = streakItems.find((li) => li.textContent?.trim().startsWith("Connections"));
    expect(wordleRow).toBeTruthy();
    expect(connectionsRow).toBeTruthy();
    // Connections has currentStreak 0 -> muted dash
    expect(connectionsRow?.textContent).toMatch(/—/);
  });

  it("renders recent history with relative days", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<You />);

    await waitFor(() => expect(screen.getAllByText(/today/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/yesterday/i)).toBeTruthy();
  });

  it("shows EmptyState for recent history when me.recent is empty", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: { ...meResponse, recent: [] } });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText("Wordle")).toBeTruthy()); // streaks loaded
    expect(screen.getByText(/no.*history|nothing.*yet|no recent/i)).toBeTruthy();
  });

  it("shows ErrorState on fetch failure and retries on click", async () => {
    mockedGetMe.mockResolvedValue({ ok: false, error: "Something went wrong — try again.", status: 500 });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(mockedGetMe).toHaveBeenCalledTimes(1);

    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(mockedGetMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("Wordle").length).toBeGreaterThan(0));
  });

  it("shows an EmptyState prompting sign-in when there is no remembered name", async () => {
    mockedLoadName.mockReturnValue(null);
    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText(/sign in|set a name/i)).toBeTruthy());
  });
});
