import { describe, it, expect } from "vitest";
import { computeMe } from "./me";
describe("computeMe", () => {
  const games = [{ id: "wordle", name: "Wordle" }, { id: "pips", name: "Pips" }];
  it("reports today's logged count and which games", () => {
    const r = computeMe({ today: "2026-07-02", games, entries: [
      { gameId: "wordle", variant: null, puzzleDate: "2026-07-02", value: 3, solved: true, direction: "lower_better" },
    ]});
    expect(r.today).toEqual({ date: "2026-07-02", loggedCount: 1, totalCount: 2,
      games: [{ gameId: "wordle", name: "Wordle", logged: true }, { gameId: "pips", name: "Pips", logged: false }] });
  });
  it("caps recent at 10, newest first", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ gameId: "wordle", variant: null,
      puzzleDate: `2026-06-${String(i + 1).padStart(2, "0")}`, value: 3, solved: true, direction: "lower_better" as const }));
    const r = computeMe({ today: "2026-07-02", games, entries });
    expect(r.recent).toHaveLength(10);
    expect(r.recent[0].puzzleDate).toBe("2026-06-12");
  });

  it("orders recent by created_at (most recently logged first) among same-day entries", () => {
    // Two games logged the SAME puzzle day; the one logged later must come first.
    const r = computeMe({ today: "2026-07-08", games, entries: [
      { gameId: "connections", variant: null, puzzleDate: "2026-07-08", value: 1, solved: true, direction: "lower_better", createdAt: "2026-07-08T09:00:00Z" },
      { gameId: "wordle", variant: null, puzzleDate: "2026-07-08", value: 3, solved: true, direction: "lower_better", createdAt: "2026-07-08T10:30:00Z" },
    ] });
    expect(r.recent[0].gameId).toBe("wordle"); // logged later → first, despite same puzzle date
    expect(r.recent[1].gameId).toBe("connections");
  });
  it("passes detail through to the recent list", () => {
    const result = computeMe({
      today: "2026-07-06",
      games: [{ id: "wordle", name: "Wordle" }],
      entries: [
        { gameId: "wordle", variant: null, puzzleDate: "2026-07-06", value: 3, solved: true, direction: "lower_better", detail: { guesses: 3, solved: true, hardMode: false, grid: [] } },
      ],
    });
    expect(result.recent[0].detail).toEqual({ guesses: 3, solved: true, hardMode: false, grid: [] });
  });
});
