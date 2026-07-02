import { describe, it, expect } from "vitest";
import {
  queensParser, tangoParser, miniSudokuParser,
  zipParser, crossclimbParser, patchesParser, wendParser,
} from "./linkedin";

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
  it("parses Zip (time, ignores backtrack line)", () => {
    expect(zipParser.parse("Zip #472 | 0:12 🏁\nWith 1 backtrack 🛑\nlnkd.in/zip.")).toEqual({
      gameId: "zip", puzzleNumber: 472, variant: null, value: 12, solved: true,
    });
  });
  it("parses Crossclimb", () => {
    expect(crossclimbParser.parse("Crossclimb #793 | 1:28\nFill order: 1️⃣ 2️⃣ 3️⃣\nlnkd.in/crossclimb.")).toEqual({
      gameId: "crossclimb", puzzleNumber: 793, variant: null, value: 88, solved: true,
    });
  });
  it("parses Patches", () => {
    expect(patchesParser.parse("Patches #107 | 0:19 🧶\nWith no hints & 1 redraw\nlnkd.in/patches.")).toEqual({
      gameId: "patches", puzzleNumber: 107, variant: null, value: 19, solved: true,
    });
  });
  it("parses Wend", () => {
    expect(wendParser.parse("Wend #24 | 0:45 🌀\nWith no hints\nlnkd.in/wend.")).toEqual({
      gameId: "wend", puzzleNumber: 24, variant: null, value: 45, solved: true,
    });
  });
  it("throws on non-matching text", () => {
    expect(() => queensParser.parse("Wordle 1,838 3/6")).toThrow();
  });
});
