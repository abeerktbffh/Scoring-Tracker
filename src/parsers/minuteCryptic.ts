import type { Parser, ParseResult } from "./types";

const HEADER = /^Minute Cryptic/im;
const HINTS = /(\d+)\s+hints?/i;

export const minuteCrypticParser: Parser = {
  gameId: "minute-cryptic",
  detect(text: string): boolean {
    return HEADER.test(text);
  },
  parse(text: string): ParseResult {
    if (!HEADER.test(text)) throw new Error("Not a Minute Cryptic result");
    const h = text.match(HINTS);
    return {
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: h ? Number(h[1]) : 0,
      solved: /🏆/u.test(text) || /solvers/i.test(text),
    };
  },
};
