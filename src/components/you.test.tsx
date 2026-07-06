// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import You from "@/app/(app)/you/page";
import { getMe, getLeaderboard, renameSelf } from "@/lib/api";
import { saveName } from "@/lib/rememberMe";
import type { MeResponse, OverallRow } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getMe: vi.fn(),
  getLeaderboard: vi.fn(),
  renameSelf: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  saveName: vi.fn(),
}));

const mockedGetMe = vi.mocked(getMe);
const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedRenameSelf = vi.mocked(renameSelf);
const mockedSaveName = vi.mocked(saveName);

const today = "2026-07-03";
const yesterday = "2026-07-02";

// Viewer identity (the header name) now comes from the server via
// me.displayName, never from localStorage.
const meResponse: MeResponse = {
  today: { date: today, loggedCount: 3, totalCount: 5, games: [] },
  streaks: [
    { gameId: "wordle", name: "Wordle", currentStreak: 7, longestStreak: 12 },
    { gameId: "pips", name: "Pips", currentStreak: 4, longestStreak: 4 },
    { gameId: "connections", name: "Connections", currentStreak: 0, longestStreak: 2 },
  ],
  recent: [
    { gameId: "wordle", name: "Wordle", variant: null, value: 3, solved: true, puzzleDate: today, detail: null },
    { gameId: "pips", name: "Pips", variant: "Hard", value: 72, solved: true, puzzleDate: today, detail: null },
    { gameId: "nyt-mini", name: "Mini", variant: null, value: 48, solved: true, puzzleDate: yesterday, detail: null },
  ],
  displayName: "You",
};

const leaderboardRows: OverallRow[] = [
  { displayName: "DJ", wins: 18, gamesPlayed: 20, winRate: 0.9 },
  { displayName: "You", wins: 16, gamesPlayed: 19, winRate: 0.84 },
  { displayName: "Devanshi", wins: 14, gamesPlayed: 18, winRate: 0.78 },
];

beforeEach(() => {
  mockedGetMe.mockReset();
  mockedGetLeaderboard.mockReset();
  mockedRenameSelf.mockReset();
  mockedSaveName.mockReset();
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
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
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
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
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
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
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
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
    });

    render(<You />);

    await waitFor(() => expect(screen.getAllByText(/today/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/yesterday/i)).toBeTruthy();
    expect(screen.getByText("3/6 ✓")).toBeTruthy();
    expect(screen.getByText("1:12")).toBeTruthy();
  });

  it("shows EmptyState for recent history when me.recent is empty", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: { ...meResponse, recent: [] } });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText("Wordle")).toBeTruthy()); // streaks loaded
    expect(screen.getByText(/no.*history|nothing.*yet|no recent/i)).toBeTruthy();
  });

  it("shows ErrorState on fetch failure and retries on click", async () => {
    mockedGetMe.mockResolvedValue({ ok: false, error: "Something went wrong — try again.", status: 500 });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(mockedGetMe).toHaveBeenCalledTimes(1);

    mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(mockedGetMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("Wordle").length).toBeGreaterThan(0));
  });

  it("shows an EmptyState prompting sign-in when the server has no display name for the viewer", async () => {
    mockedGetMe.mockResolvedValue({ ok: true, data: { ...meResponse, displayName: null } });
    mockedGetLeaderboard.mockResolvedValue({
      ok: true,
      data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: null },
    });

    render(<You />);

    await waitFor(() => expect(screen.getByText(/sign in|set a name/i)).toBeTruthy());
  });

  describe("viewer identity for a brand-new user (no localStorage name)", () => {
    // Regression guard: the header/profile name must come from the server
    // (me.displayName) — a freshly-onboarded user has never had anything
    // written to localStorage (only the rename flow writes it), yet the You
    // screen must show their name immediately.
    it("shows the header name and rank sourced from me.displayName with no localStorage dependency", async () => {
      mockedGetMe.mockResolvedValue({ ok: true, data: { ...meResponse, displayName: "Devanshi" } });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "Devanshi" },
      });

      render(<You />);

      await waitFor(() => expect(screen.getAllByText("Devanshi").length).toBeGreaterThan(0));
      // Rank: "Devanshi" is 3rd by wins (18, 16, 14)
      expect(screen.getByText(/#3/)).toBeTruthy();
    });
  });

  describe("Edit name", () => {
    beforeEach(() => {
      mockedGetMe.mockResolvedValue({ ok: true, data: meResponse });
      mockedGetLeaderboard.mockResolvedValue({
        ok: true,
        data: { window: "weekly", locked: false, players: leaderboardRows, viewerName: "You" },
      });
    });

    it("reveals an inline input pre-filled with the current name when clicking Edit name", async () => {
      render(<You />);

      await waitFor(() => expect(screen.getAllByText("You").length).toBeGreaterThan(0));

      fireEvent.click(screen.getByRole("button", { name: /edit name/i }));

      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("You");
      expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    });

    it("saves the trimmed new name, updates the header, and persists it via saveName", async () => {
      mockedRenameSelf.mockResolvedValue({ ok: true, data: { ok: true, displayName: "Abeer" } });

      render(<You />);

      await waitFor(() => expect(screen.getAllByText("You").length).toBeGreaterThan(0));
      expect(mockedGetMe).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "  Abeer  " } });

      // The reload after a successful rename reflects the server's updated
      // displayName — this is what actually drives the header, not the
      // localStorage cache.
      mockedGetMe.mockResolvedValue({ ok: true, data: { ...meResponse, displayName: "Abeer" } });
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(mockedRenameSelf).toHaveBeenCalledWith("Abeer"));
      await waitFor(() => expect(screen.getAllByText("Abeer").length).toBeGreaterThan(0));
      expect(mockedSaveName).toHaveBeenCalledWith("Abeer");
      // Editor closed
      expect(screen.queryByRole("textbox")).toBeNull();
      // Data reloaded for the new name
      await waitFor(() => expect(mockedGetMe).toHaveBeenCalledTimes(2));
    });

    it("shows a 'taken' error on 409 and keeps the editor open", async () => {
      mockedRenameSelf.mockResolvedValue({ ok: false, error: "Name is taken", status: 409 });

      render(<You />);

      await waitFor(() => expect(screen.getAllByText("You").length).toBeGreaterThan(0));

      fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Devanshi" } });
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(screen.getByText(/that name's taken/i)).toBeTruthy());
      // Editor stays open
      expect(screen.getByRole("textbox")).toBeTruthy();
      expect(mockedSaveName).not.toHaveBeenCalled();
    });
  });
});
