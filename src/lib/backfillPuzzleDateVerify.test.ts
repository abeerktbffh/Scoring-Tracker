import { describe, it, expect } from "vitest";
import { planPuzzleDateBackfill } from "./backfillPuzzleDateVerify";

const today = "2026-07-09";
// row: { id, userId, gameId, variant, puzzleNumber, parsedDate, puzzleDate }
describe("planPuzzleDateBackfill", () => {
  it("re-dates a mis-filed numbered row to its true date", () => {
    const r = planPuzzleDateBackfill([
      { id: "e1", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 798, parsedDate: null, puzzleDate: "2026-07-08" },
    ], today);
    expect(r.updates).toEqual([{ id: "e1", from: "2026-07-08", to: "2026-07-07" }]);
    expect(r.skips).toEqual([]);
  });

  it("leaves a correctly-filed row untouched", () => {
    const r = planPuzzleDateBackfill([
      { id: "e2", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 799, parsedDate: null, puzzleDate: "2026-07-08" },
    ], today);
    expect(r.updates).toEqual([]);
  });

  it("leaves a no-signal row untouched (never re-dates to the run-day fallback)", () => {
    const r = planPuzzleDateBackfill([
      { id: "e3", userId: "u1", gameId: "minute-cryptic", variant: null, puzzleNumber: null, parsedDate: null, puzzleDate: "2026-03-15" },
    ], today);
    expect(r.updates).toEqual([]);
    expect(r.skips).toEqual([]);
  });

  it("skips (does not clobber) when re-dating would collide with an existing active row for the same slot", () => {
    const r = planPuzzleDateBackfill([
      { id: "eOld", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 798, parsedDate: null, puzzleDate: "2026-07-08" },
      { id: "eThere", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 798, parsedDate: null, puzzleDate: "2026-07-07" },
    ], today);
    expect(r.updates).toEqual([]);
    expect(r.skips.map((s) => s.id)).toContain("eOld");
  });
});
