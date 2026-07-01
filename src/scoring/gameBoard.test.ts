import { describe, it, expect } from "vitest";
import { computeGameBoard, type DatedGameEntry } from "./gameBoard";

const e = (playerId: string, puzzleDate: string, value: number, solved = true): DatedGameEntry => ({
  playerId, gameId: "wordle", variant: null, puzzleKey: `wordle|${puzzleDate}`,
  value, solved, direction: "lower_better", puzzleDate,
});

const eHigher = (playerId: string, puzzleDate: string, value: number, solved = true): DatedGameEntry => ({
  playerId, gameId: "trivia", variant: null, puzzleKey: `trivia|${puzzleDate}`,
  value, solved, direction: "higher_better", puzzleDate,
});

describe("computeGameBoard", () => {
  it("computes wins, best value, and all-time streaks", () => {
    const entries: DatedGameEntry[] = [
      e("a", "2026-07-13", 4),
      e("a", "2026-07-14", 3),
      e("a", "2026-07-15", 2), // a: 3-day streak, best 2
      e("b", "2026-07-15", 5),
    ];
    // window = all (start null); today = 2026-07-15
    expect(computeGameBoard(entries, "2026-07-15", null)).toEqual([
      { playerId: "a", wins: 3, gamesPlayed: 3, bestValue: 2, currentStreak: 3, longestStreak: 3 },
      { playerId: "b", wins: 0, gamesPlayed: 1, bestValue: 5, currentStreak: 1, longestStreak: 1 },
    ]);
  });
  it("windows wins/played/best but keeps streaks all-time", () => {
    const entries: DatedGameEntry[] = [
      e("a", "2026-07-01", 2), // outside a weekly window ending 07-15
      e("a", "2026-07-14", 4),
      e("a", "2026-07-15", 3),
    ];
    // start = 2026-07-09 (weekly). In-window: 07-14, 07-15 → played 2, best 3. Streak all-time: 07-14,07-15 => 2.
    const r = computeGameBoard(entries, "2026-07-15", "2026-07-09");
    expect(r[0]).toEqual({
      playerId: "a", wins: 2, gamesPlayed: 2, bestValue: 3, currentStreak: 2, longestStreak: 2,
    });
  });
  it("bestValue is null when nothing solved in window", () => {
    const entries: DatedGameEntry[] = [e("a", "2026-07-15", 7, false)];
    const r = computeGameBoard(entries, "2026-07-15", null);
    expect(r[0].bestValue).toBeNull();
    expect(r[0].wins).toBe(0);
    expect(r[0].currentStreak).toBe(1); // played today, even though unsolved
  });
  it("excludes a player whose entries are all outside the window", () => {
    const entries: DatedGameEntry[] = [
      e("a", "2026-07-01", 2),
      e("a", "2026-07-02", 3),
      e("b", "2026-07-15", 4),
    ];
    const r = computeGameBoard(entries, "2026-07-15", "2026-07-09");
    expect(r.map((s) => s.playerId)).toEqual(["b"]);
  });
  it("sorts higher_better per-game entries with the higher value first", () => {
    const entries: DatedGameEntry[] = [
      eHigher("a", "2026-07-15", 10),
      eHigher("b", "2026-07-15", 20),
    ];
    const r = computeGameBoard(entries, "2026-07-15", null);
    expect(r.map((s) => s.playerId)).toEqual(["b", "a"]);
    expect(r[0].bestValue).toBe(20);
    expect(r[1].bestValue).toBe(10);
  });
});
