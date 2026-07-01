import type { Parser, ParseResult } from "./types";

const LINE = /Wordle\s+([\d,]+)\s+([X\d])\/6/i;

export const wordleParser: Parser = {
  gameId: "wordle",
  detect(text: string): boolean {
    return LINE.test(text);
  },
  parse(text: string): ParseResult {
    const m = text.match(LINE);
    if (!m) throw new Error("Not a Wordle result");
    const puzzleNumber = Number(m[1].replace(/,/g, ""));
    const guesses = m[2].toUpperCase();
    const solved = guesses !== "X";
    return {
      gameId: "wordle",
      puzzleNumber,
      variant: null,
      value: solved ? Number(guesses) : 7,
      solved,
    };
  },
};
