import { describe, it, expect } from "vitest";
import { currentStreak, longestStreak } from "./streaks";

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-07-13", "2026-07-14", "2026-07-15"], "2026-07-15")).toBe(3);
  });
  it("stays alive if last play was yesterday", () => {
    expect(currentStreak(["2026-07-13", "2026-07-14"], "2026-07-15")).toBe(2);
  });
  it("is 0 if the last play was more than a day ago", () => {
    expect(currentStreak(["2026-07-10", "2026-07-11"], "2026-07-15")).toBe(0);
  });
  it("ignores duplicates and order", () => {
    expect(currentStreak(["2026-07-15", "2026-07-14", "2026-07-15"], "2026-07-15")).toBe(2);
  });
  it("is 0 for no plays", () => {
    expect(currentStreak([], "2026-07-15")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run", () => {
    expect(longestStreak(["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-10", "2026-07-11"])).toBe(3);
  });
  it("handles a single day", () => {
    expect(longestStreak(["2026-07-01"])).toBe(1);
  });
  it("is 0 for no plays", () => {
    expect(longestStreak([])).toBe(0);
  });
});
