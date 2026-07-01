import { describe, it, expect } from "vitest";
import { windowStart } from "./window";

describe("windowStart", () => {
  it("daily = today", () => {
    expect(windowStart("daily", "2026-07-15")).toBe("2026-07-15");
  });
  it("weekly = today minus 6 days", () => {
    expect(windowStart("weekly", "2026-07-15")).toBe("2026-07-09");
  });
  it("monthly = today minus 29 days", () => {
    expect(windowStart("monthly", "2026-07-15")).toBe("2026-06-16");
  });
  it("all = null", () => {
    expect(windowStart("all", "2026-07-15")).toBeNull();
  });
});
