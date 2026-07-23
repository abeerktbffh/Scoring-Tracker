import { describe, it, expect } from "vitest";
import { computeTodayDetail, type TodayEntry } from "./todayDetail";

const games = [{ id: "wordle", name: "Wordle" }, { id: "pips", name: "Pips" }, { id: "zip", name: "Zip" }];
const e = (o: Partial<TodayEntry>): TodayEntry => ({
  playerId: "p", gameId: "wordle", variant: null, value: 3, solved: true, direction: "lower_better", ...o,
});

describe("computeTodayDetail", () => {
  it("ranks the viewer among solved entries (lower_better) and counts players", () => {
    const entries = [
      e({ playerId: "me", gameId: "wordle", value: 3 }),
      e({ playerId: "a", gameId: "wordle", value: 2 }),
      e({ playerId: "b", gameId: "wordle", value: 5 }),
    ];
    const wordle = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!;
    expect(wordle).toMatchObject({ played: true, solved: true, rank: 2, playerCount: 3 });
    expect(wordle.valueFormatted).toBe("3/6 ✓");
  });
  it("ties share a rank (dense): two players on the best value → viewer is 1st", () => {
    const entries = [
      e({ playerId: "me", gameId: "wordle", value: 2 }),
      e({ playerId: "a", gameId: "wordle", value: 2 }),
      e({ playerId: "b", gameId: "wordle", value: 4 }),
    ];
    expect(computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!.rank).toBe(1);
  });
  it("not played → played:false, null score/rank, playerCount from others", () => {
    const entries = [e({ playerId: "a", gameId: "wordle", value: 2 })];
    const w = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!;
    expect(w).toEqual({ gameId: "wordle", name: "Wordle", played: false, valueFormatted: null, solved: false, rank: null, playerCount: 1 });
  });
  it("viewer unsolved → rank null but played true", () => {
    const entries = [e({ playerId: "me", gameId: "wordle", value: 7, solved: false }), e({ playerId: "a", value: 3 })];
    const w = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!;
    expect(w.played).toBe(true); expect(w.rank).toBeNull();
  });
  it("game with no entries at all → played:false, playerCount 0", () => {
    const z = computeTodayDetail({ games, entries: [], viewerId: "me" }).find((d) => d.gameId === "zip")!;
    expect(z).toMatchObject({ played: false, rank: null, playerCount: 0 });
  });
  it("respects the viewer's variant (Pips): rank only vs same-variant players", () => {
    const entries = [
      e({ playerId: "me", gameId: "pips", variant: "hard", value: 60 }),
      e({ playerId: "a", gameId: "pips", variant: "hard", value: 90 }),
      e({ playerId: "b", gameId: "pips", variant: "easy", value: 10 }),
    ];
    const p = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "pips")!;
    expect(p).toMatchObject({ rank: 1, playerCount: 2 }); // easy player excluded
  });
});
