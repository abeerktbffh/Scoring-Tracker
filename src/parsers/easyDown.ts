import type { Parser, ParseResult } from "./types";
import { parseDurationSeconds } from "./duration";

// The Hindu "One Down" crossword (shown as "Easy Down") shares a generic
// "I just solved this Crossword…" sentence — worded like India Mini — so the
// thehindu.com/crosswords/hindu-one-down link is the ONLY reliable marker.
const MARKER = /thehindu\.com\/crosswords\/hindu-one-down/i;

export const easyDownParser: Parser = {
  gameId: "easy-down",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an Easy Down result");
    const seconds = parseDurationSeconds(text);
    if (seconds === null) throw new Error("No time found in Easy Down result");
    return {
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
      puzzleDate: null,
    };
  },
};
