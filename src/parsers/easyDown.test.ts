import { describe, it, expect } from "vitest";
import { easyDownParser } from "./easyDown";

const SAMPLE =
  "I just solved this Crossword in 3 minutes and 7 seconds. Can you beat my time? [https://www.thehindu.com/crosswords/hindu-one-down]";

describe("easy down parser", () => {
  it("detects its own share link, rejects India Mini and Hindu Mini", () => {
    expect(easyDownParser.detect(SAMPLE)).toBe(true);
    // Same "I just solved this Crossword" wording as India Mini — must NOT match India Mini's link
    expect(easyDownParser.detect("I just solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    expect(easyDownParser.detect("I just solved The Hindu Mini in 2 minutes and 51 seconds. https://www.thehindu.com/crosswords/thehindu-mini-crossword")).toBe(false);
    expect(easyDownParser.detect("Wordle 1,234 3/6")).toBe(false);
  });
  it("parses time into total seconds, no number/date", () => {
    expect(easyDownParser.parse(SAMPLE)).toEqual({
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: 187,
      solved: true,
      detail: { seconds: 187 },
      puzzleDate: null,
    });
  });
  it("throws on non-matching text", () => {
    expect(() => easyDownParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
