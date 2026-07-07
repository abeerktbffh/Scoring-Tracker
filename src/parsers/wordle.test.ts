import { describe, it, expect } from "vitest";
import { wordleParser } from "./wordle";

describe("wordle parser", () => {
  it("detects Wordle share text", () => {
    expect(wordleParser.detect("Wordle 1,234 3/6\n\n⬛🟨⬛⬛⬛")).toBe(true);
    expect(wordleParser.detect("Connections\nPuzzle #123")).toBe(false);
  });

  it("does not detect Wordle embedded mid-sentence", () => {
    expect(
      wordleParser.detect("I love talking about Wordle 234 3/6 with friends"),
    ).toBe(false);
  });

  it("parses a solved result with a comma-formatted puzzle number", () => {
    expect(wordleParser.parse("Wordle 1,234 3/6\n\n⬛🟨⬛⬛⬛")).toEqual({
      gameId: "wordle",
      puzzleNumber: 1234,
      variant: null,
      value: 3,
      solved: true,
      detail: {
        guesses: 3,
        solved: true,
        hardMode: false,
        grid: ["⬛🟨⬛⬛⬛"],
      },
    });
  });

  it("parses a failed result (X/6) as unsolved with value 7", () => {
    expect(wordleParser.parse("Wordle 900 X/6")).toEqual({
      gameId: "wordle",
      puzzleNumber: 900,
      variant: null,
      value: 7,
      solved: false,
      detail: {
        guesses: null,
        solved: false,
        hardMode: false,
        grid: [],
      },
    });
  });

  it("throws on unparseable text", () => {
    expect(() => wordleParser.parse("hello world")).toThrow();
  });
});

describe("wordle detail", () => {
  it("captures guesses, solved, hardMode, and the verbatim grid", () => {
    const text = "Wordle 1,234 3/6*\n\n⬛🟨⬛⬛⬛\n⬛🟩🟨⬛⬛\n🟩🟩🟩🟩🟩";
    expect(wordleParser.parse(text).detail).toEqual({
      guesses: 3,
      solved: true,
      hardMode: true,
      grid: ["⬛🟨⬛⬛⬛", "⬛🟩🟨⬛⬛", "🟩🟩🟩🟩🟩"],
    });
  });
  it("marks a failed Wordle solved:false, guesses:null, and never emits the sentinel 7 in detail", () => {
    const d = wordleParser.parse("Wordle 900 X/6").detail;
    expect(d).toEqual({ guesses: null, solved: false, hardMode: false, grid: [] });
  });
  it("keeps the ranking scalar unchanged", () => {
    expect(wordleParser.parse("Wordle 1,234 3/6\n\n🟩🟩🟩🟩🟩").value).toBe(3);
    expect(wordleParser.parse("Wordle 900 X/6").value).toBe(7);
  });
});
