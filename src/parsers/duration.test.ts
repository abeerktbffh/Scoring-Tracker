import { describe, it, expect } from "vitest";
import { parseDurationSeconds } from "./duration";

describe("parseDurationSeconds", () => {
  it("parses 'X minutes and Y seconds'", () => {
    expect(parseDurationSeconds("in 2 minutes and 51 seconds")).toBe(171);
    expect(parseDurationSeconds("in 5 minutes and 20 seconds")).toBe(320);
  });
  it("parses minutes only", () => {
    expect(parseDurationSeconds("in 2 minutes")).toBe(120);
  });
  it("parses seconds only", () => {
    expect(parseDurationSeconds("in 45 seconds")).toBe(45);
  });
  it("handles singular '1 minute and 1 second'", () => {
    expect(parseDurationSeconds("in 1 minute and 1 second")).toBe(61);
  });
  it("returns null when no time is present", () => {
    expect(parseDurationSeconds("no duration here")).toBeNull();
  });
});
