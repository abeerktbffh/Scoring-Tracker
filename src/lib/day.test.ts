import { describe, it, expect } from "vitest";
import { localDateInTz, toDayNumber, fromDayNumber } from "./day";

describe("localDateInTz", () => {
  it("rolls to the next local day past the UTC midnight boundary (IST)", () => {
    // 2026-07-01T19:00:00Z is 00:30 IST on 2026-07-02.
    expect(localDateInTz("Asia/Kolkata", new Date("2026-07-01T19:00:00Z"))).toBe(
      "2026-07-02",
    );
  });

  it("stays on the same local day for a mid-day UTC instant (IST)", () => {
    // 2026-07-01T06:00:00Z is 11:30 IST on 2026-07-01.
    expect(localDateInTz("Asia/Kolkata", new Date("2026-07-01T06:00:00Z"))).toBe(
      "2026-07-01",
    );
  });

  it("returns the plain UTC date for a UTC group", () => {
    expect(localDateInTz("UTC", new Date("2026-07-01T23:59:00Z"))).toBe("2026-07-01");
  });
});

describe("day numbers", () => {
  it("round-trips a date through day numbers", () => {
    expect(fromDayNumber(toDayNumber("2026-07-01"))).toBe("2026-07-01");
  });
  it("consecutive days differ by exactly 1", () => {
    expect(toDayNumber("2026-07-02") - toDayNumber("2026-07-01")).toBe(1);
  });
  it("spans month boundaries", () => {
    expect(toDayNumber("2026-08-01") - toDayNumber("2026-07-31")).toBe(1);
  });
});
