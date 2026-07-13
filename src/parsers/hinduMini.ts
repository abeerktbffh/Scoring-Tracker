import type { Parser, ParseResult } from "./types";
import { parseDurationSeconds } from "./duration";

// The Hindu Mini crossword shares a sentence with a total time and a
// thehindu.com/crosswords/thehindu-mini-crossword link (the reliable marker).
const MARKER = /thehindu\.com\/crosswords\/thehindu-mini-crossword/i;

export const hinduMiniParser: Parser = {
  gameId: "hindu-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not a Hindu Mini result");
    const seconds = parseDurationSeconds(text);
    if (seconds === null) throw new Error("No time found in Hindu Mini result");
    return {
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
      puzzleDate: null,
    };
  },
};
