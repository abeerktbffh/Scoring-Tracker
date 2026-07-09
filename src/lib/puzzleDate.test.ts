import { describe, it, expect } from "vitest";
import { resolvePuzzleDate, PUZZLE_EPOCH } from "./puzzleDate";

describe("resolvePuzzleDate", () => {
  const today = "2026-07-09";

  it("computes epoch + number for numbered games (real anchors)", () => {
    expect(resolvePuzzleDate({ gameId: "pinpoint", puzzleNumber: 799 }, today)).toEqual({ date: "2026-07-08", source: "epoch" });
    expect(resolvePuzzleDate({ gameId: "pinpoint", puzzleNumber: 798 }, today)).toEqual({ date: "2026-07-07", source: "epoch" });
    expect(resolvePuzzleDate({ gameId: "mini-sudoku", puzzleNumber: 331 }, today)).toEqual({ date: "2026-07-08", source: "epoch" });
    expect(resolvePuzzleDate({ gameId: "mini-sudoku", puzzleNumber: 330 }, today)).toEqual({ date: "2026-07-07", source: "epoch" });
  });

  it("prefers an embedded parsedDate over the number", () => {
    expect(resolvePuzzleDate({ gameId: "india-mini", puzzleNumber: null, parsedDate: "2026-07-06" }, today))
      .toEqual({ date: "2026-07-06", source: "parsed" });
  });

  it("falls back to today when there is no identifier", () => {
    expect(resolvePuzzleDate({ gameId: "nyt-mini", puzzleNumber: null }, today)).toEqual({ date: today, source: "fallback" });
  });

  it("falls back to today (source fallback) for a numbered game with no epoch — caller warns", () => {
    expect(resolvePuzzleDate({ gameId: "brand-new-game", puzzleNumber: 5 }, today)).toEqual({ date: today, source: "fallback" });
  });

  it("has an epoch for every currently-numbered game", () => {
    for (const g of ["wordle","connections","strands","pinpoint","queens","crossclimb","tango","zip","mini-sudoku","pips","patches","wend"]) {
      expect(PUZZLE_EPOCH[g]).toBeDefined();
    }
  });
});
