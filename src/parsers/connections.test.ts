import { describe, it, expect } from "vitest";
import { connectionsParser } from "./connections";

const SOLVED = `Connections
Puzzle #1116
🟩🟦🟪🟪
🟦🟨🟨🟨
🟨🟨🟨🟨
🟩🟩🟩🟩
🟦🟦🟦🟦
🟪🟪🟪🟪`;

const FAILED = `Connections
Puzzle #1117
🟩🟦🟪🟨
🟦🟨🟨🟨
🟩🟦🟪🟨
🟦🟨🟩🟪
🟨🟨🟨🟨`;

describe("connections parser", () => {
  it("detects Connections share text", () => {
    expect(connectionsParser.detect(SOLVED)).toBe(true);
    expect(connectionsParser.detect("Wordle 1,838 3/6")).toBe(false);
  });
  it("counts mistakes and marks solved when all four groups are found", () => {
    expect(connectionsParser.parse(SOLVED)).toEqual({
      gameId: "connections",
      puzzleNumber: 1116,
      variant: null,
      value: 2,
      solved: true,
      detail: {
        mistakes: 2,
        solvedAll: true,
        grid: ["🟩🟦🟪🟪", "🟦🟨🟨🟨", "🟨🟨🟨🟨", "🟩🟩🟩🟩", "🟦🟦🟦🟦", "🟪🟪🟪🟪"],
      },
    });
  });
  it("marks unsolved when fewer than four groups are found", () => {
    // 4 mixed rows + 1 mono row => mono=1, mistakes=4, not solved
    expect(connectionsParser.parse(FAILED)).toEqual({
      gameId: "connections",
      puzzleNumber: 1117,
      variant: null,
      value: 4,
      solved: false,
      detail: {
        mistakes: 4,
        solvedAll: false,
        grid: ["🟩🟦🟪🟨", "🟦🟨🟨🟨", "🟩🟦🟪🟨", "🟦🟨🟩🟪", "🟨🟨🟨🟨"],
      },
    });
  });
  it("throws on non-Connections text", () => {
    expect(() => connectionsParser.parse("hello")).toThrow();
  });
});

describe("connections detail", () => {
  it("captures mistakes, solvedAll, and the verbatim grid", () => {
    expect(connectionsParser.parse(SOLVED).detail).toEqual({
      mistakes: 2,
      solvedAll: true,
      grid: ["🟩🟦🟪🟪", "🟦🟨🟨🟨", "🟨🟨🟨🟨", "🟩🟩🟩🟩", "🟦🟦🟦🟦", "🟪🟪🟪🟪"],
    });
    expect(connectionsParser.parse(SOLVED).value).toBe(2);
  });
});
