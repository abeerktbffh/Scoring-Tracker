import { describe, it, expect } from "vitest";
import { parseClock } from "./time";

describe("parseClock", () => {
  it("parses m:ss", () => {
    expect(parseClock("9:53")).toBe(593);
    expect(parseClock("0:31")).toBe(31);
    expect(parseClock("1:20")).toBe(80);
  });
  it("parses h:mm:ss", () => {
    expect(parseClock("1:02:03")).toBe(3723);
  });
  it("parses plain seconds", () => {
    expect(parseClock("45")).toBe(45);
  });
  it("trims surrounding whitespace", () => {
    expect(parseClock("  0:38  ")).toBe(38);
  });
  it("returns null for malformed input", () => {
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("1:")).toBeNull();
    expect(parseClock("1:2:3:4")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});
