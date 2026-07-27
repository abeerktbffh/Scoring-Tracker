import { describe, it, expect } from "vitest";
import { hinduMiniParser } from "./hinduMini";

const SAMPLE =
  "I scored 141 on this Crossword. Think you can do better? https://www.thehindu.com/?id=cc734818&set=thehindu-mini-crossword&puzzleType=crossword";

describe("hindu mini parser (points format)", () => {
  it("detects the new set=thehindu-mini-crossword link, rejects others", () => {
    expect(hinduMiniParser.detect(SAMPLE)).toBe(true);
    // Easy Down's new-style link (different set= value)
    expect(
      hinduMiniParser.detect(
        "I scored 90 on this Crossword. https://www.thehindu.com/?id=abc&set=hindu-one-down&puzzleType=crossword",
      ),
    ).toBe(false);
    // India Mini
    expect(hinduMiniParser.detect("solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    // OLD time-format Hindu Mini link is no longer detected (that era is retired)
    expect(
      hinduMiniParser.detect(
        "I just solved The Hindu Mini in 2 minutes and 51 seconds. https://www.thehindu.com/crosswords/thehindu-mini-crossword",
      ),
    ).toBe(false);
    expect(hinduMiniParser.detect("Wordle 1,234 3/6")).toBe(false);
  });

  it("parses the score into value + detail.points, no number/date", () => {
    expect(hinduMiniParser.parse(SAMPLE)).toEqual({
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: 141,
      solved: true,
      detail: { points: 141 },
      puzzleDate: null,
    });
  });

  it("handles comma-formatted scores", () => {
    const s =
      "I scored 1,234 on this Crossword. https://www.thehindu.com/?id=z&set=thehindu-mini-crossword&puzzleType=crossword";
    expect(hinduMiniParser.parse(s).value).toBe(1234);
  });

  it("throws when the marker matches but no score is present", () => {
    const s =
      "I finished this Crossword! https://www.thehindu.com/?id=z&set=thehindu-mini-crossword&puzzleType=crossword";
    expect(() => hinduMiniParser.parse(s)).toThrow();
  });

  it("throws on non-matching text", () => {
    expect(() => hinduMiniParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
