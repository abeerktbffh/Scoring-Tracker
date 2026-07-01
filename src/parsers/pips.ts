import type { Parser, ParseResult } from "./types";
import { parseClock } from "@/lib/time";

const HEADER = /^Pips\s+#(\d+)\s+(Easy|Medium|Hard)/im;
const CLOCK = /(\d+:\d{2})/;

export const pipsParser: Parser = {
  gameId: "pips",
  detect(text: string): boolean {
    return HEADER.test(text);
  },
  parse(text: string): ParseResult {
    const h = text.match(HEADER);
    if (!h) throw new Error("Not a Pips result");
    const c = text.match(CLOCK);
    const value = c ? parseClock(c[1]) : null;
    if (value === null) throw new Error("No valid Pips time");
    return {
      gameId: "pips",
      puzzleNumber: Number(h[1]),
      variant: h[2].toLowerCase(),
      value,
      solved: true,
    };
  },
};
