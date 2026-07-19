import { describe, it, expect } from "vitest";
import { decideHook } from "./hookDecision";

describe("decideHook", () => {
  it("fires when key present and not run today", () => {
    expect(decideHook({ state: { lastRunDate: "2026-07-18", lastRunAt: null }, today: "2026-07-19", hasKey: true }))
      .toEqual({ fire: true, reason: "due" });
  });
  it("does not fire if already run today", () => {
    expect(decideHook({ state: { lastRunDate: "2026-07-19", lastRunAt: null }, today: "2026-07-19", hasKey: true }).fire).toBe(false);
  });
  it("does not fire if no key configured (silent no-op)", () => {
    expect(decideHook({ state: { lastRunDate: null, lastRunAt: null }, today: "2026-07-19", hasKey: false }))
      .toEqual({ fire: false, reason: "no-key" });
  });
});
