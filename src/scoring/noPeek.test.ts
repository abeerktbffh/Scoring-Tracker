import { describe, it, expect } from "vitest";
import { isDailyBoardLocked, visibleTodayEntries } from "./noPeek";

describe("isDailyBoardLocked", () => {
  it("locks the daily board for a game not played today", () => {
    expect(isDailyBoardLocked("daily", false)).toBe(true);
  });
  it("unlocks the daily board once the game is played today", () => {
    expect(isDailyBoardLocked("daily", true)).toBe(false);
  });
  it("never locks non-daily windows", () => {
    expect(isDailyBoardLocked("weekly", false)).toBe(false);
    expect(isDailyBoardLocked("all", false)).toBe(false);
  });
});

describe("visibleTodayEntries", () => {
  it("keeps only entries for played games", () => {
    const entries = [{ gameId: "wordle" }, { gameId: "pips" }, { gameId: "queens" }];
    expect(visibleTodayEntries(entries, new Set(["wordle", "queens"]))).toEqual([
      { gameId: "wordle" }, { gameId: "queens" },
    ]);
  });
  it("returns nothing when the played set is empty", () => {
    expect(visibleTodayEntries([{ gameId: "wordle" }], new Set())).toEqual([]);
  });
});
