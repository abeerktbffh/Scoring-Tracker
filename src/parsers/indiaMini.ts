import type { Parser, ParseResult } from "./types";

// India Mini crossword shares a sentence like "…solved this Crossword in
// 5 minutes and 20 seconds…" plus an indiamini.in link (the reliable marker).
const MARKER = /indiamini\.in/i;
const MIN_SEC = /(\d+)\s*minutes?\s*(?:and\s*)?(\d+)\s*seconds?/i;
const MIN_ONLY = /(\d+)\s*minutes?/i;
const SEC_ONLY = /(\d+)\s*seconds?/i;

export const indiaMiniParser: Parser = {
  gameId: "india-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an India Mini result");
    let seconds: number | null = null;
    const both = text.match(MIN_SEC);
    if (both) {
      seconds = Number(both[1]) * 60 + Number(both[2]);
    } else {
      const mins = text.match(MIN_ONLY);
      const secs = text.match(SEC_ONLY);
      if (mins) seconds = Number(mins[1]) * 60 + (secs ? Number(secs[1]) : 0);
      else if (secs) seconds = Number(secs[1]);
    }
    if (seconds === null) throw new Error("No time found in India Mini result");
    // Date embedded in the share URL: al-crossword-mini-YYYYMMDD
    const dm = text.match(/al-crossword-mini-(\d{4})(\d{2})(\d{2})/);
    const puzzleDate = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;
    return {
      gameId: "india-mini",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
      puzzleDate,
    };
  },
};
