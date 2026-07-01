import { describe, it, expect } from "vitest";
import { wordleParser } from "./wordle";

describe("wordle parser", () => {
  it("detects Wordle share text", () => {
    expect(wordleParser.detect("Wordle 1,234 3/6\n\n⬛🟨⬛⬛⬛")).toBe(true);
    expect(wordleParser.detect("Connections\nPuzzle #123")).toBe(false);
  });

  it("parses a solved result with a comma-formatted puzzle number", () => {
    expect(wordleParser.parse("Wordle 1,234 3/6\n\n⬛🟨⬛⬛⬛")).toEqual({
      gameId: "wordle",
      puzzleNumber: 1234,
      variant: null,
      value: 3,
      solved: true,
    });
  });

  it("parses a failed result (X/6) as unsolved with value 7", () => {
    expect(wordleParser.parse("Wordle 900 X/6")).toEqual({
      gameId: "wordle",
      puzzleNumber: 900,
      variant: null,
      value: 7,
      solved: false,
    });
  });

  it("throws on unparseable text", () => {
    expect(() => wordleParser.parse("hello world")).toThrow();
  });
});
