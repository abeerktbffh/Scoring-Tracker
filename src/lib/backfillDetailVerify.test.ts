import { describe, it, expect } from "vitest";
import { summarizeDetailCoverage } from "./backfillDetailVerify";

describe("summarizeDetailCoverage", () => {
  it("computes fractional coverage of re-parsed rows", () => {
    expect(summarizeDetailCoverage({ total: 10, reparsed: 8, failed: 2 })).toEqual({
      total: 10,
      reparsed: 8,
      failed: 2,
      coverage: 0.8,
    });
  });
  it("treats an empty run as fully covered (nothing to backfill)", () => {
    expect(summarizeDetailCoverage({ total: 0, reparsed: 0, failed: 0 })).toEqual({
      total: 0,
      reparsed: 0,
      failed: 0,
      coverage: 1,
    });
  });
});
