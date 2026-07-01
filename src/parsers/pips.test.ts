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
    });
  });
  it("parses an Easy result", () => {
    expect(pipsParser.parse("Pips #317 Easy 🟢\n1:20")).toEqual({
      gameId: "pips",
      puzzleNumber: 317,
      variant: "easy",
      value: 80,
      solved: true,
    });
  });
  it("throws on non-Pips text", () => {
    expect(() => pipsParser.parse("hello")).toThrow();
  });
});
