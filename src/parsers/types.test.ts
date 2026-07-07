import { describe, it, expect } from "vitest";
import type { ParseResult, ResultDetail } from "./types";

describe("ParseResult detail contract", () => {
  it("accepts a structured detail alongside the ranking scalar", () => {
    const detail: ResultDetail = { guesses: 3, solved: true, hardMode: true, grid: ["🟩🟩🟩🟩🟩"] };
    const r: ParseResult = {
      gameId: "wordle",
      puzzleNumber: 1,
      variant: null,
      value: 3,
      solved: true,
      detail,
    };
    expect(r.detail?.grid?.length).toBe(1);
    expect(r.detail?.seconds).toBeUndefined();
  });

  it("treats detail as optional (parsers may omit it)", () => {
    const r: ParseResult = { gameId: "nyt-mini", puzzleNumber: null, variant: null, value: 48, solved: true };
    expect(r.detail).toBeUndefined();
  });
});
