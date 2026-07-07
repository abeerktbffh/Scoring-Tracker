import { describe, it, expect } from "vitest";
import { formatResult, shapeForGame } from "./formatResult";

describe("shapeForGame", () => {
  it("maps each game to its value shape", () => {
    expect(shapeForGame("wordle")).toBe("wordle");
    expect(shapeForGame("pinpoint")).toBe("pinpoint");
    expect(shapeForGame("connections")).toBe("connections");
    expect(shapeForGame("strands")).toBe("hints");
    expect(shapeForGame("minute-cryptic")).toBe("hints");
    expect(shapeForGame("pips")).toBe("timed");
    expect(shapeForGame("queens")).toBe("timed");
    expect(shapeForGame("nyt-mini")).toBe("timed");
  });
  it("defaults unknown games to timed", () => {
    expect(shapeForGame("totally-new-game")).toBe("timed");
  });
});

describe("formatResult", () => {
  it("timed -> mm:ss (incl. 0:0N and 9:53)", () => {
    expect(formatResult("queens", 31, true)).toBe("0:31");
    expect(formatResult("pips", 593, true)).toBe("9:53");
  });
  it("Wordle solved -> n/6 with a check; failed -> X/6 with a cross (never raw 7)", () => {
    expect(formatResult("wordle", 3, true)).toBe("3/6 ✓");
    expect(formatResult("wordle", 7, false)).toBe("X/6 ✗");
  });
  it("Pinpoint -> guesses with singular/plural", () => {
    expect(formatResult("pinpoint", 3, true)).toBe("3 guesses");
    expect(formatResult("pinpoint", 1, true)).toBe("1 guess");
  });
  it("Connections -> Perfect / N mistakes / Failed", () => {
    expect(formatResult("connections", 0, true)).toBe("Perfect");
    expect(formatResult("connections", 2, true)).toBe("2 mistakes");
    expect(formatResult("connections", 1, true)).toBe("1 mistake");
    expect(formatResult("connections", 4, false)).toBe("Failed");
  });
  it("Hints -> No hints / N hints", () => {
    expect(formatResult("strands", 0, true)).toBe("No hints");
    expect(formatResult("strands", 2, true)).toBe("2 hints");
    expect(formatResult("minute-cryptic", 1, true)).toBe("1 hint");
  });
});
