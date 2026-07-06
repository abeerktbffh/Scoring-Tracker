import type { Parser, ParseResult, ResultDetail } from "./types";
import { parseClock } from "@/lib/time";

const CLOCK = /(\d+:\d{2})/;

// LinkedIn timed games share "<Name> #<n>" followed by an m:ss time.
// Each game may capture extra structured detail (backtracks/redraws/etc.);
// the default is just the raw seconds.
export function makeLinkedInTimedParser(
  gameId: string,
  displayName: string,
  extractDetail: (text: string, seconds: number) => ResultDetail = (_t, seconds) => ({ seconds }),
): Parser {
  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^${escaped}\\s+#(\\d+)`, "im");
  return {
    gameId,
    detect(text: string): boolean {
      return header.test(text);
    },
    parse(text: string): ParseResult {
      const h = text.match(header);
      if (!h) throw new Error(`Not a ${displayName} result`);
      const c = text.match(CLOCK);
      const value = c ? parseClock(c[1]) : null;
      if (value === null) throw new Error(`No valid ${displayName} time`);
      return {
        gameId,
        puzzleNumber: Number(h[1]),
        variant: null,
        value,
        solved: true,
        detail: extractDetail(text, value),
      };
    },
  };
}

export const queensParser = makeLinkedInTimedParser("queens", "Queens");
export const tangoParser = makeLinkedInTimedParser("tango", "Tango");
export const miniSudokuParser = makeLinkedInTimedParser("mini-sudoku", "Mini Sudoku");

export const zipParser = makeLinkedInTimedParser("zip", "Zip", (text, seconds) => {
  const b = text.match(/(\d+)\s+backtrack/i);
  return { seconds, backtracks: b ? Number(b[1]) : 0 };
});

export const crossclimbParser = makeLinkedInTimedParser("crossclimb", "Crossclimb", (text, seconds) => {
  const KEYCAP = /([0-9])️?⃣/gu;
  const fillOrder = [...text.matchAll(KEYCAP)].map((m) => Number(m[1]));
  return { seconds, fillOrder };
});

export const patchesParser = makeLinkedInTimedParser("patches", "Patches", (text, seconds) => {
  const noHints = /no hints/i.test(text);
  const h = text.match(/(\d+)\s+hints?/i);
  const r = text.match(/(\d+)\s+redraws?/i);
  return { seconds, hints: noHints ? 0 : h ? Number(h[1]) : 0, redraws: r ? Number(r[1]) : 0 };
});

export const wendParser = makeLinkedInTimedParser("wend", "Wend", (text, seconds) => {
  const noHints = /no hints/i.test(text);
  const h = text.match(/(\d+)\s+hints?/i);
  return { seconds, hints: noHints ? 0 : h ? Number(h[1]) : 0 };
});
