import type { Parser, ParseResult } from "./types";
import { parseDurationSeconds } from "./duration";

// India Mini crossword shares a sentence like "…solved this Crossword in
// 5 minutes and 20 seconds…" plus an indiamini.in link (the reliable marker).
const MARKER = /indiamini\.in/i;

export const indiaMiniParser: Parser = {
  gameId: "india-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an India Mini result");
    const seconds = parseDurationSeconds(text);
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
