import type { Parser, ParseResult } from "./types";

// The Hindu "One Down" (shown as "Easy Down") now shares an "I scored N on
// this Crossword…" sentence with a thehindu.com/?…&set=hindu-one-down&… link.
// The `set=hindu-one-down` query param is the reliable marker (the old
// /crosswords/ path is gone). Score is points, higher is better. PURE.
const MARKER = /set=hindu-one-down/i;
const SCORE = /scored\s+([\d,]+)/i;

export const easyDownParser: Parser = {
  gameId: "easy-down",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an Easy Down result");
    const m = SCORE.exec(text);
    if (!m) throw new Error("No score found in Easy Down result");
    const points = parseInt(m[1].replace(/,/g, ""), 10);
    return {
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: points,
      solved: true,
      detail: { points },
      puzzleDate: null,
    };
  },
};
