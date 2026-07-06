import { describe, it, expect } from "vitest";
import { tallyMedals, computeMedalBoard, computeOverallMedals, computeDailyContest, type GameEntryLike } from "./medals";
import type { GameEntry } from "./wins";
import type { DatedGameEntry } from "./gameBoard";

const base = { gameId: "wordle", variant: null, puzzleKey: "wordle|1", direction: "lower_better" as const };

describe("tallyMedals", () => {
  it("awards gold to the best, silver/bronze to the next distinct values", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 2, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
      { ...base, playerId: "c", value: 4, solved: true },
    ];
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 1, silver: 0, bronze: 0 },
      { playerId: "b", gold: 0, silver: 1, bronze: 0 },
      { playerId: "c", gold: 0, silver: 0, bronze: 1 },
    ]);
  });

  it("co-winners at the best value all take gold (tie for first)", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
      { ...base, playerId: "c", value: 5, solved: true },
    ];
    // Two golds; next distinct value (5) is silver.
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 1, silver: 0, bronze: 0 },
      { playerId: "b", gold: 1, silver: 0, bronze: 0 },
      { playerId: "c", gold: 0, silver: 1, bronze: 0 },
    ]);
  });

  it("ignores unsolved entries and gives no medal past 3rd distinct value", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 1, solved: true },
      { ...base, playerId: "b", value: 2, solved: true },
      { ...base, playerId: "c", value: 3, solved: true },
      { ...base, playerId: "d", value: 4, solved: true },
      { ...base, playerId: "e", value: 9, solved: false },
    ];
    const byId = Object.fromEntries(tallyMedals(entries).map((m) => [m.playerId, m]));
    expect(byId.d).toEqual({ playerId: "d", gold: 0, silver: 0, bronze: 0 });
    expect(byId.e).toEqual({ playerId: "e", gold: 0, silver: 0, bronze: 0 });
  });

  it("respects higher_better direction", () => {
    const entries: GameEntry[] = [
      { ...base, direction: "higher_better", playerId: "a", value: 10, solved: true },
      { ...base, direction: "higher_better", playerId: "b", value: 20, solved: true },
    ];
    const byId = Object.fromEntries(tallyMedals(entries).map((m) => [m.playerId, m]));
    expect(byId.b.gold).toBe(1);
    expect(byId.a.silver).toBe(1);
  });

  it("sums medals across separate puzzles and sorts by gold, then silver, then bronze, then id", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 2, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "b", value: 40, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "a", value: 55, solved: true },
    ];
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 1, silver: 1, bronze: 0 },
      { playerId: "b", gold: 1, silver: 1, bronze: 0 },
    ]);
  });

  it("gives no medals when all entries in a group are unsolved", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 2, solved: false },
      { ...base, playerId: "b", value: 3, solved: false },
      { ...base, playerId: "c", value: 4, solved: false },
    ];
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 0, silver: 0, bronze: 0 },
      { playerId: "b", gold: 0, silver: 0, bronze: 0 },
      { playerId: "c", gold: 0, silver: 0, bronze: 0 },
    ]);
  });

  it("awards single gold to the sole solved entry in a group", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 5, solved: true },
      { ...base, playerId: "b", value: 3, solved: false },
      { ...base, playerId: "c", value: 7, solved: false },
    ];
    const byId = Object.fromEntries(tallyMedals(entries).map((m) => [m.playerId, m]));
    expect(byId.a).toEqual({ playerId: "a", gold: 1, silver: 0, bronze: 0 });
    expect(byId.b).toEqual({ playerId: "b", gold: 0, silver: 0, bronze: 0 });
    expect(byId.c).toEqual({ playerId: "c", gold: 0, silver: 0, bronze: 0 });
  });
});

describe("computeMedalBoard", () => {
  const dg = (playerId: string, puzzleDate: string, value: number, solved = true): DatedGameEntry => ({
    playerId, gameId: "wordle", variant: null, puzzleKey: `wordle|${puzzleDate}`,
    value, solved, direction: "lower_better", puzzleDate,
  });

  it("ranks by medals over the window and reports played + all-time PB", () => {
    const entries: DatedGameEntry[] = [
      dg("a", "2026-07-05", 2), dg("b", "2026-07-05", 3),
      dg("a", "2026-07-06", 4), dg("b", "2026-07-06", 3),
      dg("a", "2026-06-01", 1), // out of window; still counts toward PB (all-time)
    ];
    const board = computeMedalBoard(entries, "2026-07-05");
    // 07-05: a=2 gold, b=3 silver. 07-06: b=3 gold, a=4 silver.
    // Both end gold:1 silver:1 bronze:0 → tie broken by playerId → a before b.
    expect(board.map((r) => r.playerId)).toEqual(["a", "b"]);
    const byId = Object.fromEntries(board.map((r) => [r.playerId, r]));
    expect(byId.b).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, pb: 3 });
    expect(byId.a).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, pb: 1 });
  });

  it("drops players with no in-window entries but PB stays all-time", () => {
    const entries: DatedGameEntry[] = [dg("a", "2026-06-01", 5)];
    expect(computeMedalBoard(entries, "2026-07-01")).toEqual([]);
  });
});

describe("computeOverallMedals", () => {
  it("sums medals across games, counts played, and lists games led", () => {
    const entries: GameEntry[] = [
      { gameId: "wordle", variant: null, puzzleKey: "wordle|1", direction: "lower_better", playerId: "a", value: 2, solved: true },
      { gameId: "wordle", variant: null, puzzleKey: "wordle|1", direction: "lower_better", playerId: "b", value: 3, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "b", value: 40, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "a", value: 55, solved: true },
    ];
    const byId = Object.fromEntries(computeOverallMedals(entries).map((r) => [r.playerId, r]));
    expect(byId.a).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, gamesLed: ["wordle"] });
    expect(byId.b).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, gamesLed: ["mini"] });
  });

  it("lists the same game in gamesLed for all players tied for max gold in that game", () => {
    // Two players, two puzzle-days in same game, tied gold counts
    const entries: GameEntry[] = [
      // Day 1: x and y both value 10 (tied for gold)
      { gameId: "game1", variant: null, puzzleKey: "game1|day1", direction: "lower_better", playerId: "x", value: 10, solved: true },
      { gameId: "game1", variant: null, puzzleKey: "game1|day1", direction: "lower_better", playerId: "y", value: 10, solved: true },
      // Day 2: x and y both value 20 (tied for gold)
      { gameId: "game1", variant: null, puzzleKey: "game1|day2", direction: "lower_better", playerId: "x", value: 20, solved: true },
      { gameId: "game1", variant: null, puzzleKey: "game1|day2", direction: "lower_better", playerId: "y", value: 20, solved: true },
    ];
    const result = computeOverallMedals(entries);
    const byId = Object.fromEntries(result.map((r) => [r.playerId, r]));
    expect(byId.x).toMatchObject({ gold: 2, silver: 0, bronze: 0, gamesPlayed: 2, gamesLed: ["game1"] });
    expect(byId.y).toMatchObject({ gold: 2, silver: 0, bronze: 0, gamesPlayed: 2, gamesLed: ["game1"] });
  });

  it("skips games where no entry is solved (maxGold === 0) and does not throw", () => {
    // Game with all unsolved entries, plus another game with solved entries
    const entries: GameEntry[] = [
      // game1: all unsolved (no one gets medals)
      { gameId: "game1", variant: null, puzzleKey: "game1|1", direction: "lower_better", playerId: "a", value: 5, solved: false },
      { gameId: "game1", variant: null, puzzleKey: "game1|1", direction: "lower_better", playerId: "b", value: 8, solved: false },
      // game2: a solves it (gets gold)
      { gameId: "game2", variant: null, puzzleKey: "game2|1", direction: "lower_better", playerId: "a", value: 10, solved: true },
    ];
    const result = computeOverallMedals(entries);
    const byId = Object.fromEntries(result.map((r) => [r.playerId, r]));
    // a: 2 entries (1 unsolved in game1, 1 solved in game2), led game2 only
    // b: 1 entry (unsolved in game1), no games led
    expect(byId.a).toMatchObject({ gold: 1, silver: 0, bronze: 0, gamesPlayed: 2, gamesLed: ["game2"] });
    expect(byId.b).toMatchObject({ gold: 0, silver: 0, bronze: 0, gamesPlayed: 1, gamesLed: [] });
  });

  it("handles single-game player: all entries in one game, gamesPlayed matches entry count", () => {
    // Player "solo" only in game1 with 3 entries; player "other" in both games
    const entries: GameEntry[] = [
      // game1: solo has 3 entries, other has 1
      { gameId: "game1", variant: null, puzzleKey: "game1|1", direction: "lower_better", playerId: "solo", value: 5, solved: true },
      { gameId: "game1", variant: null, puzzleKey: "game1|1", direction: "lower_better", playerId: "other", value: 10, solved: true },
      { gameId: "game1", variant: null, puzzleKey: "game1|2", direction: "lower_better", playerId: "solo", value: 3, solved: true },
      { gameId: "game1", variant: null, puzzleKey: "game1|3", direction: "lower_better", playerId: "solo", value: 7, solved: true },
      // game2: other only
      { gameId: "game2", variant: null, puzzleKey: "game2|1", direction: "lower_better", playerId: "other", value: 2, solved: true },
    ];
    const result = computeOverallMedals(entries);
    const byId = Object.fromEntries(result.map((r) => [r.playerId, r]));
    // solo: 3 entries all in game1, earns 3 golds (each puzzle-day solo is best)
    expect(byId.solo).toMatchObject({ gold: 3, silver: 0, bronze: 0, gamesPlayed: 3, gamesLed: ["game1"] });
    // other: 2 entries (1 in game1, 1 in game2), 1 silver from game1, 1 gold from game2
    expect(byId.other).toMatchObject({ gold: 1, silver: 1, bronze: 0, gamesPlayed: 2, gamesLed: ["game2"] });
  });
});

describe("computeDailyContest", () => {
  const e = (playerId: string, value: number, solved = true): GameEntry => ({
    playerId, gameId: "wordle", variant: null, puzzleKey: "wordle|2026-07-06",
    value, solved, direction: "lower_better",
  });

  it("ranks solved by direction, medals the top three distinct, unsolved last", () => {
    const rows = computeDailyContest([e("a", 4), e("b", 2), e("c", 3), e("d", 9, false)]);
    expect(rows.map((r) => r.playerId)).toEqual(["b", "c", "a", "d"]);
    expect(rows.map((r) => r.medal)).toEqual(["gold", "silver", "bronze", null]);
  });

  it("co-winners tie for gold; the next distinct value is silver", () => {
    const rows = computeDailyContest([e("a", 3), e("b", 3), e("c", 5)]);
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId.a.medal).toBe("gold");
    expect(byId.b.medal).toBe("gold");
    expect(byId.c.medal).toBe("silver");
  });
});
