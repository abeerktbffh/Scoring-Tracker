import { describe, it, expect } from "vitest";
import { indiaMiniParser } from "./indiaMini";

const SAMPLE =
  "I just solved this Crossword in 5 minutes and 20 seconds. Can you beat my time? https://indiamini.in/play/?id=al-crossword-mini-20260702&set=pm-content-crossword-india-mini&puzzleType=crossword&utm_source=end_modal";

describe("india mini parser", () => {
  it("detects India Mini share text via its link", () => {
    expect(indiaMiniParser.detect(SAMPLE)).toBe(true);
    expect(indiaMiniParser.detect("Wordle 1,234 3/6")).toBe(false);
  });

  it("parses 'X minutes and Y seconds' into total seconds, no puzzle number", () => {
    expect(indiaMiniParser.parse(SAMPLE)).toEqual({
      gameId: "india-mini",
      puzzleNumber: null,
      variant: null,
      value: 320,
      solved: true,
      detail: { seconds: 320 },
      puzzleDate: "2026-07-02",
    });
  });

  it("handles minutes only", () => {
    expect(indiaMiniParser.parse("solved this Crossword in 2 minutes https://indiamini.in/play").value).toBe(120);
  });

  it("handles seconds only", () => {
    expect(indiaMiniParser.parse("solved this Crossword in 45 seconds https://indiamini.in/play").value).toBe(45);
  });

  it("handles singular '1 minute and 1 second'", () => {
    expect(indiaMiniParser.parse("solved in 1 minute and 1 second https://indiamini.in/x").value).toBe(61);
  });

  it("throws on non-India-Mini text", () => {
    expect(() => indiaMiniParser.parse("solved in 3 minutes somewhere else")).toThrow();
  });

  it("extracts the puzzle date from the share URL", () => {
    const text = "I just solved this Crossword in 59 seconds.\nhttps://indiamini.in/play/?id=al-crossword-mini-20260706&set=";
    expect(indiaMiniParser.parse(text).puzzleDate).toBe("2026-07-06");
  });
  it("leaves puzzleDate undefined when the URL has no date", () => {
    const text = "I just solved this Crossword in 59 seconds.\nhttps://indiamini.in/play/";
    expect(indiaMiniParser.parse(text).puzzleDate ?? null).toBeNull();
  });
});

describe("india mini detail", () => {
  it("captures seconds", () => {
    expect(indiaMiniParser.parse(SAMPLE).detail).toEqual({ seconds: 320 });
  });
});
