import { describe, it, expect } from "vitest";
import { strandsParser } from "./strands";

const SAMPLE = `Strands #851
"Added flavor"
🔵🔵🔵🔵
🔵🟡`;

describe("strands parser", () => {
  it("detects Strands share text", () => {
    expect(strandsParser.detect(SAMPLE)).toBe(true);
    expect(strandsParser.detect("Wordle 1,234 3/6")).toBe(false);
  });

  it("parses puzzle number and zero hints, solved", () => {
    expect(strandsParser.parse(SAMPLE)).toEqual({
      gameId: "strands",
      puzzleNumber: 851,
      variant: null,
      value: 0,
      solved: true,
      detail: {
        hints: 0,
        theme: "Added flavor",
        grid: ["🔵🔵🔵🔵", "🔵🟡"],
      },
    });
  });

  it("counts hint bulbs as the score", () => {
    const withHints = `Strands #852
"Theme"
🔵💡🔵🔵
💡🟡`;
    expect(strandsParser.parse(withHints).value).toBe(2);
  });

  it("throws on non-Strands text", () => {
    expect(() => strandsParser.parse("hello")).toThrow();
  });
});

describe("strands detail", () => {
  it("captures hints, theme, and the verbatim grid", () => {
    expect(strandsParser.parse(SAMPLE).detail).toEqual({
      hints: 0,
      theme: "Added flavor",
      grid: ["🔵🔵🔵🔵", "🔵🟡"],
    });
    expect(strandsParser.parse(SAMPLE).value).toBe(0);
  });
});
