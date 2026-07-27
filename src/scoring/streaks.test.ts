import { describe, it, expect } from "vitest";
import { currentStreak, longestStreak, weekdayOf } from "./streaks";
import { toDayNumber } from "@/lib/day";

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

describe("weekdayOf", () => {
  it("maps real dates to weekdays (0=Sun … 6=Sat)", () => {
    expect(weekdayOf(toDayNumber("2026-07-24"))).toBe(5); // Friday
    expect(weekdayOf(toDayNumber("2026-07-27"))).toBe(1); // Monday
    expect(weekdayOf(toDayNumber("2026-07-26"))).toBe(0); // Sunday
  });
});

describe("schedule-aware streaks (Easy Down, Mon–Fri = [1,2,3,4,5])", () => {
  const MF = [1, 2, 3, 4, 5];

  it("counts Fri→Mon across a weekend as consecutive", () => {
    // Thu 07-23, Fri 07-24, Mon 07-27; today = Mon 07-27
    expect(currentStreak(["2026-07-23", "2026-07-24", "2026-07-27"], "2026-07-27", MF)).toBe(3);
    expect(longestStreak(["2026-07-23", "2026-07-24", "2026-07-27"], MF)).toBe(3);
  });

  it("still breaks on a genuinely missed weekday", () => {
    // Mon 07-20, Wed 07-22 (Tue 07-21 missed); today = Wed 07-22 → only today counts
    expect(currentStreak(["2026-07-20", "2026-07-22"], "2026-07-22", MF)).toBe(1);
    expect(longestStreak(["2026-07-20", "2026-07-22"], MF)).toBe(1);
  });

  it("keeps the streak alive on Sat/Sun after the latest Friday", () => {
    expect(currentStreak(["2026-07-23", "2026-07-24"], "2026-07-25", MF)).toBe(2); // Sat
    expect(currentStreak(["2026-07-23", "2026-07-24"], "2026-07-26", MF)).toBe(2); // Sun
  });

  it("is 0 once the latest published weekday is missed beyond the one-puzzle grace", () => {
    // Latest play Fri 07-24; today = Tue 07-28 (Mon 07-27 was missed)
    expect(currentStreak(["2026-07-23", "2026-07-24"], "2026-07-28", MF)).toBe(0);
  });
});
