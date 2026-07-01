import { describe, it, expect } from "vitest";
import { tallyWins, type GameEntry } from "./wins";

const base = { gameId: "wordle", variant: null, puzzleKey: "wordle|1234", direction: "lower_better" as const };

describe("tallyWins", () => {
  it("awards the win to the best (lowest) value", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 4, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "a", wins: 1 },
      { playerId: "b", wins: 0 },
    ]);
  });

  it("awards the win to the best (highest) value when higher_better", () => {
    const entries: GameEntry[] = [
      { ...base, direction: "higher_better", playerId: "a", value: 10, solved: true },
      { ...base, direction: "higher_better", playerId: "b", value: 20, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "b", wins: 1 },
      { playerId: "a", wins: 0 },
    ]);
  });

  it("gives co-wins on a tie", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "a", wins: 1 },
      { playerId: "b", wins: 1 },
    ]);
  });

  it("never lets an unsolved entry beat a solved one", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 7, solved: false },
      { ...base, playerId: "b", value: 6, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "b", wins: 1 },
      { playerId: "a", wins: 0 },
    ]);
  });

  it("gives a solo player the win", () => {
    const entries: GameEntry[] = [{ ...base, playerId: "a", value: 5, solved: true }];
    expect(tallyWins(entries)).toEqual([{ playerId: "a", wins: 1 }]);
  });

  it("sums wins across separate games/puzzles", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 4, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|2026-07-01", direction: "lower_better", playerId: "b", value: 40, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|2026-07-01", direction: "lower_better", playerId: "a", value: 55, solved: true },
    ];
    expect(tallyWins(entries)).toEqual([
      { playerId: "a", wins: 1 },
      { playerId: "b", wins: 1 },
    ]);
  });
});
