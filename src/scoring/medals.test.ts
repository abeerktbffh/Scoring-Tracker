import { describe, it, expect } from "vitest";
import { tallyMedals, type GameEntryLike } from "./medals";
import type { GameEntry } from "./wins";

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
