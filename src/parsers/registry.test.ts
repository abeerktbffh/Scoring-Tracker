import { describe, it, expect } from "vitest";
import { detectAndParse } from "./registry";

describe("detectAndParse", () => {
  it("routes Wordle text to the Wordle parser", () => {
    const r = detectAndParse("Wordle 1,234 3/6");
    expect(r?.gameId).toBe("wordle");
    expect(r?.value).toBe(3);
  });

  it("returns null when no parser matches", () => {
    expect(detectAndParse("random text nobody parses")).toBeNull();
  });

  it("returns null when a matching parser's parse() throws", () => {
    const boom = {
      gameId: "boom",
      detect: () => true,
      parse: () => {
        throw new Error("boom");
      },
    };
    expect(detectAndParse("anything", [boom])).toBeNull();
  });
});

describe("detectAndParse routes every known game", () => {
  const cases: [string, string, string][] = [
    ["wordle", "Wordle 1,838 3/6", "wordle"],
    ["pips", "Pips #317 Hard 🔴\n9:53", "pips"],
    ["connections", "Connections\nPuzzle #1116\n🟨🟨🟨🟨\n🟩🟩🟩🟩\n🟦🟦🟦🟦\n🟪🟪🟪🟪", "connections"],
    ["minute-cryptic", "Minute Cryptic - 1 July, 2026\n🏆 0 hints", "minute-cryptic"],
    ["queens", "Queens #792\n0:31 👑", "queens"],
    ["tango", "Tango #632\n0:23 🌗", "tango"],
    ["mini-sudoku", "Mini Sudoku #324 | 0:38 ✏️", "mini-sudoku"],
  ];
  it.each(cases)("routes %s text to the right parser", (_label, text, expectedGameId) => {
    expect(detectAndParse(text)?.gameId).toBe(expectedGameId);
  });
});

describe("detectAndParse routing — thehindu.com vs indiamini.in (no collision)", () => {
  const cases: [string, string][] = [
    ["I just solved this Crossword in 59 seconds https://indiamini.in/play/?id=al-crossword-mini-20260702", "india-mini"],
    ["I just solved The Hindu Mini in 2 minutes and 51 seconds. https://www.thehindu.com/crosswords/thehindu-mini-crossword", "hindu-mini"],
    ["I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down", "easy-down"],
  ];
  for (const [text, gameId] of cases) {
    it(`routes to ${gameId}`, () => {
      expect(detectAndParse(text)?.gameId).toBe(gameId);
    });
  }
});
