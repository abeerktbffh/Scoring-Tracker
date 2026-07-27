import type { Parser, ParseResult } from "./types";

// The Hindu Mini crossword now shares an "I scored N on this Crossword…"
// sentence with a thehindu.com/?…&set=thehindu-mini-crossword&… link. The
// `set=thehindu-mini-crossword` query param is the reliable marker (the old
// /crosswords/ path is gone). Score is points, higher is better. PURE.
const MARKER = /set=thehindu-mini-crossword/i;
const SCORE = /scored\s+([\d,]+)/i;

export const hinduMiniParser: Parser = {
  gameId: "hindu-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not a Hindu Mini result");
    const m = SCORE.exec(text);
    if (!m) throw new Error("No score found in Hindu Mini result");
    const points = parseInt(m[1].replace(/,/g, ""), 10);
    return {
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: points,
      solved: true,
      detail: { points },
      puzzleDate: null,
    };
  },
};
