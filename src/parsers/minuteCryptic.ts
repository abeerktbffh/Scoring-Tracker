import type { Parser, ParseResult } from "./types";

const HEADER = /^Minute Cryptic/im;
const HINTS = /(\d+)\s+hints?/i;
const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

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
    // Header: "Minute Cryptic - D Month, YYYY" — static month lookup, no Date().
    const dm = text.match(/Minute Cryptic\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/i);
    let puzzleDate: string | null = null;
    if (dm) {
      const mm = MONTHS[dm[2].toLowerCase()];
      if (mm) puzzleDate = `${dm[3]}-${mm}-${dm[1].padStart(2, "0")}`;
    }
    return {
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: hints,
      solved: /🏆/u.test(text) || /solvers/i.test(text),
      detail: { hints, underPar: up ? Number(up[1]) : null },
      puzzleDate,
    };
  },
};
