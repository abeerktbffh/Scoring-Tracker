import type { Parser, ParseResult } from "./types";
import { parseClock } from "@/lib/time";

const CLOCK = /(\d+:\d{2})/;

// LinkedIn timed games share "<Name> #<n>" followed by an m:ss time.
// The separator varies (newline for Queens/Tango, " | " for Mini Sudoku),
// so we match the header and then find the first clock anywhere in the text.
export function makeLinkedInTimedParser(gameId: string, displayName: string): Parser {
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
      return { gameId, puzzleNumber: Number(h[1]), variant: null, value, solved: true };
    },
  };
}

export const queensParser = makeLinkedInTimedParser("queens", "Queens");
export const tangoParser = makeLinkedInTimedParser("tango", "Tango");
export const miniSudokuParser = makeLinkedInTimedParser("mini-sudoku", "Mini Sudoku");
export const zipParser = makeLinkedInTimedParser("zip", "Zip");
export const crossclimbParser = makeLinkedInTimedParser("crossclimb", "Crossclimb");
export const patchesParser = makeLinkedInTimedParser("patches", "Patches");
export const wendParser = makeLinkedInTimedParser("wend", "Wend");
