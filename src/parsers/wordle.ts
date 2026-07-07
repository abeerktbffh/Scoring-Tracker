import type { Parser, ParseResult } from "./types";

const LINE = /^Wordle\s+([\d,]+)\s+([X\d])\/6/im;
// Wordle tiles: dark/light blanks + present/correct, plus colorblind variants.
const TILE = /[⬛⬜🟨🟩🟧🟦]/gu;

function wordleGrid(text: string): string[] {
  return text
    .split("\n")
    .map((line) => [...line.matchAll(TILE)].map((m) => m[0]))
    .filter((sq) => sq.length === 5)
    .map((sq) => sq.join(""));
}

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
    // Hard mode is shown as "3/6*" in the header line.
    const hardMode = /\/6\*/.test(text);
    return {
      gameId: "wordle",
      puzzleNumber,
      variant: null,
      value: solved ? Number(guesses) : 7,
      solved,
      detail: {
        guesses: solved ? Number(guesses) : null,
        solved,
        hardMode,
        grid: wordleGrid(text),
      },
    };
  },
};
