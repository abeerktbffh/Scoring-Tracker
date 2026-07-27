import { describe, it, expect } from "vitest";
import { publishDaysFor, ALL_DAYS } from "./schedule";

describe("publishDaysFor", () => {
  it("returns Mon–Fri for easy-down", () => {
    expect(publishDaysFor("easy-down")).toEqual([1, 2, 3, 4, 5]);
  });
  it("returns all 7 days for a daily game and for unknown ids", () => {
    expect(publishDaysFor("wordle")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(publishDaysFor("totally-unknown")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("ALL_DAYS is the 7-day week", () => {
    expect([...ALL_DAYS]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
