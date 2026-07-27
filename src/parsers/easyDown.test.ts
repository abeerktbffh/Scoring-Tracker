import { describe, it, expect } from "vitest";
import { easyDownParser } from "./easyDown";

const SAMPLE =
  "I scored 69 on this Crossword. Think you can do better? https://www.thehindu.com/?id=sdfoioe&set=hindu-one-down&puzzleType=crossword";

describe("easy down parser (points format)", () => {
  it("detects the new set=hindu-one-down link, rejects others", () => {
    expect(easyDownParser.detect(SAMPLE)).toBe(true);
    // Hindu Mini's new-style link (different set= value) — no collision
    expect(
      easyDownParser.detect(
        "I scored 141 on this Crossword. https://www.thehindu.com/?id=abc&set=thehindu-mini-crossword&puzzleType=crossword",
      ),
    ).toBe(false);
    // India Mini
    expect(easyDownParser.detect("solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    // OLD time-format Easy Down link is no longer detected (that era is retired)
    expect(
      easyDownParser.detect(
        "I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down",
      ),
    ).toBe(false);
    expect(easyDownParser.detect("Wordle 1,234 3/6")).toBe(false);
  });

  it("parses the score into value + detail.points, no number/date", () => {
    expect(easyDownParser.parse(SAMPLE)).toEqual({
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: 69,
      solved: true,
      detail: { points: 69 },
      puzzleDate: null,
    });
  });

  it("handles comma-formatted scores", () => {
    const s =
      "I scored 1,234 on this Crossword. https://www.thehindu.com/?id=z&set=hindu-one-down&puzzleType=crossword";
    expect(easyDownParser.parse(s).value).toBe(1234);
  });

  it("throws when the marker matches but no score is present", () => {
    const s =
      "I finished this Crossword! https://www.thehindu.com/?id=z&set=hindu-one-down&puzzleType=crossword";
    expect(() => easyDownParser.parse(s)).toThrow();
  });

  it("throws on non-matching text", () => {
    expect(() => easyDownParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
