import { describe, it, expect } from "vitest";
import { computeOverall } from "./leaderboard";
import type { GameEntry } from "./wins";

const wordle = (playerId: string, puzzleKey: string, value: number): GameEntry => ({
  playerId, gameId: "wordle", variant: null, puzzleKey, value, solved: true, direction: "lower_better",
});

describe("computeOverall", () => {
  it("computes wins, games played, and win rate", () => {
    const entries: GameEntry[] = [
      wordle("a", "wordle|2026-07-01", 3), // a wins day 1
      wordle("b", "wordle|2026-07-01", 4),
      wordle("a", "wordle|2026-07-02", 5), // b wins day 2
      wordle("b", "wordle|2026-07-02", 3),
    ];
    expect(computeOverall(entries)).toEqual([
      { playerId: "a", wins: 1, gamesPlayed: 2, winRate: 0.5 },
      { playerId: "b", wins: 1, gamesPlayed: 2, winRate: 0.5 },
    ]);
  });
  it("win rate is 0 when nothing played", () => {
    expect(computeOverall([])).toEqual([]);
  });
  it("orders by wins desc then win rate desc then id", () => {
    const entries: GameEntry[] = [
      wordle("a", "wordle|2026-07-01", 3),
      wordle("b", "wordle|2026-07-01", 4),
      wordle("b", "wordle|2026-07-02", 3), // b: 1 win / 2 played = 0.5; a: 1 win / 1 played = 1.0
    ];
    const r = computeOverall(entries);
    expect(r.map((x) => x.playerId)).toEqual(["a", "b"]); // tie on wins(1), a has higher winRate
    expect(r[0]).toEqual({ playerId: "a", wins: 1, gamesPlayed: 1, winRate: 1 });
  });
});
