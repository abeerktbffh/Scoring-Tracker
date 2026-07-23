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
    expect(w).toEqual({ gameId: "wordle", name: "Wordle", variant: null, played: false, valueFormatted: null, solved: false, rank: null, playerCount: 1 });
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
    const p = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "pips" && d.variant === "hard")!;
    expect(p).toMatchObject({ variant: "hard", rank: 1, playerCount: 2 }); // easy player excluded
  });
  it("splits a variant game (Pips) into one row per difficulty played today, board order", () => {
    const games = [{ id: "pips", name: "Pips" }];
    const entries: TodayEntry[] = [
      { playerId: "me", gameId: "pips", variant: "medium", value: 60, solved: true, direction: "lower_better" },
      { playerId: "a", gameId: "pips", variant: "medium", value: 90, solved: true, direction: "lower_better" },
      { playerId: "b", gameId: "pips", variant: "easy", value: 20, solved: true, direction: "lower_better" },
      { playerId: "c", gameId: "pips", variant: "hard", value: 200, solved: true, direction: "lower_better" },
    ];
    const rows = computeTodayDetail({ games, entries, viewerId: "me" });
    expect(rows.map((r) => r.variant)).toEqual(["easy", "medium", "hard"]); // compareVariant order
    const easy = rows.find((r) => r.variant === "easy")!;
    expect(easy).toMatchObject({ played: false, rank: null, playerCount: 1 }); // viewer didn't play easy
    const medium = rows.find((r) => r.variant === "medium")!;
    expect(medium).toMatchObject({ played: true, rank: 1, playerCount: 2, solved: true }); // 60 beats 90
  });
  it("a variant game with a single difficulty today → one row with that variant", () => {
    const rows = computeTodayDetail({ games: [{ id: "pips", name: "Pips" }],
      entries: [{ playerId: "me", gameId: "pips", variant: "hard", value: 100, solved: true, direction: "lower_better" }], viewerId: "me" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variant: "hard", played: true, playerCount: 1 });
  });
  it("a variant game with NO entries today → one row, variant null, not played", () => {
    const rows = computeTodayDetail({ games: [{ id: "pips", name: "Pips" }], entries: [], viewerId: "me" });
    expect(rows).toEqual([{ gameId: "pips", name: "Pips", variant: null, played: false, valueFormatted: null, solved: false, rank: null, playerCount: 0 }]);
  });
  it("non-variant game stays a single row (variant null)", () => {
    const rows = computeTodayDetail({ games: [{ id: "wordle", name: "Wordle" }],
      entries: [{ playerId: "me", gameId: "wordle", variant: null, value: 3, solved: true, direction: "lower_better" }], viewerId: "me" });
    expect(rows).toHaveLength(1);
    expect(rows[0].variant).toBeNull();
  });
});
