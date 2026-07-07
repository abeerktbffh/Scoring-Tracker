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
    const hints = h ? Number(h[1]) : 0;
    const up = text.match(/(\d+)\s+under the community par/i);
    return {
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: hints,
      solved: /🏆/u.test(text) || /solvers/i.test(text),
      detail: { hints, underPar: up ? Number(up[1]) : null },
    };
  },
};
