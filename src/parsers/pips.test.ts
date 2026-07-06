import { describe, it, expect } from "vitest";
import { pipsParser } from "./pips";

describe("pips parser", () => {
  it("detects Pips share text", () => {
    expect(pipsParser.detect("Pips #317 Hard 🔴\n9:53")).toBe(true);
    expect(pipsParser.detect("Wordle 1,838 3/6")).toBe(false);
  });
  it("parses a Hard result with time in seconds and lowercased variant", () => {
    expect(pipsParser.parse("Pips #317 Hard 🔴\n9:53")).toEqual({
      gameId: "pips",
      puzzleNumber: 317,
      variant: "hard",
      value: 593,
      solved: true,
      detail: { seconds: 593, difficulty: "hard" },
    });
  });
  it("parses an Easy result", () => {
    expect(pipsParser.parse("Pips #317 Easy 🟢\n1:20")).toEqual({
      gameId: "pips",
      puzzleNumber: 317,
      variant: "easy",
      value: 80,
      solved: true,
      detail: { seconds: 80, difficulty: "easy" },
    });
  });
  it("throws on non-Pips text", () => {
    expect(() => pipsParser.parse("hello")).toThrow();
  });
  it("parses a Medium result", () => {
    expect(pipsParser.parse("Pips #318 Medium 🟡\n2:05")).toEqual({
      gameId: "pips",
      puzzleNumber: 318,
      variant: "medium",
      value: 125,
      solved: true,
      detail: { seconds: 125, difficulty: "medium" },
    });
  });
  it("throws when the time line is missing", () => {
    expect(() => pipsParser.parse("Pips #317 Hard 🔴")).toThrow();
  });
});

describe("pips detail", () => {
  it("captures seconds and difficulty", () => {
    expect(pipsParser.parse("Pips #317 Hard 🔴\n9:53").detail).toEqual({ seconds: 593, difficulty: "hard" });
  });
});
