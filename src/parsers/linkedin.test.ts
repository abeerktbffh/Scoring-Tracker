import { describe, it, expect } from "vitest";
import { queensParser, tangoParser, miniSudokuParser } from "./linkedin";

describe("linkedin timed parsers", () => {
  it("parses Queens (newline separator)", () => {
    expect(queensParser.parse("Queens #792\n0:31 👑\nlnkd.in/queens.")).toEqual({
      gameId: "queens",
      puzzleNumber: 792,
      variant: null,
      value: 31,
      solved: true,
    });
  });
  it("parses Tango", () => {
    expect(tangoParser.parse("Tango #632\n0:23 🌗\nlnkd.in/tango.")).toEqual({
      gameId: "tango",
      puzzleNumber: 632,
      variant: null,
      value: 23,
      solved: true,
    });
  });
  it("parses Mini Sudoku (pipe separator, same line)", () => {
    expect(
      miniSudokuParser.parse("Mini Sudoku #324 | 0:38 ✏️\nlnkd.in/minisudoku."),
    ).toEqual({
      gameId: "mini-sudoku",
      puzzleNumber: 324,
      variant: null,
      value: 38,
      solved: true,
    });
  });
  it("each parser only detects its own game", () => {
    expect(queensParser.detect("Tango #632\n0:23")).toBe(false);
    expect(tangoParser.detect("Queens #792\n0:31")).toBe(false);
    expect(miniSudokuParser.detect("Queens #792\n0:31")).toBe(false);
  });
  it("throws on non-matching text", () => {
    expect(() => queensParser.parse("Wordle 1,838 3/6")).toThrow();
  });
});
