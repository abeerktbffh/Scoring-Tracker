import { describe, it, expect } from "vitest";
import { hinduMiniParser } from "./hinduMini";

const SAMPLE =
  "I just solved The Hindu Mini in 2 minutes and 51 seconds. Test your wits at [https://www.thehindu.com/crosswords/thehindu-mini-crossword]";

describe("hindu mini parser", () => {
  it("detects its own share link, rejects others", () => {
    expect(hinduMiniParser.detect(SAMPLE)).toBe(true);
    expect(hinduMiniParser.detect("I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down")).toBe(false);
    expect(hinduMiniParser.detect("solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    expect(hinduMiniParser.detect("Wordle 1,234 3/6")).toBe(false);
  });
  it("parses time into total seconds, no number/date", () => {
    expect(hinduMiniParser.parse(SAMPLE)).toEqual({
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: 171,
      solved: true,
      detail: { seconds: 171 },
      puzzleDate: null,
    });
  });
  it("throws on non-matching text", () => {
    expect(() => hinduMiniParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
