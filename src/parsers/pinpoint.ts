import type { Parser, ParseResult } from "./types";

// LinkedIn Pinpoint shares "Pinpoint #<n> | <N> guesses" plus a list of
// percentage-match lines. Score is the guess count (fewer is better).
const HEADER = /^Pinpoint\s+#(\d+)/im;
const GUESSES = /(\d+)\s*guess(?:es)?/i;

export const pinpointParser: Parser = {
  gameId: "pinpoint",
  detect(text: string): boolean {
    return HEADER.test(text);
  },
  parse(text: string): ParseResult {
    const h = text.match(HEADER);
    if (!h) throw new Error("Not a Pinpoint result");
    const g = text.match(GUESSES);
    if (!g) throw new Error("No guess count in Pinpoint result");
    const trail = [...text.matchAll(/(\d+)%\s*match/gi)].map((m) => Number(m[1]));
    const solved = /📌/u.test(text) || /100%/.test(text);
    return {
      gameId: "pinpoint",
      puzzleNumber: Number(h[1]),
      variant: null,
      value: Number(g[1]),
      solved,
      detail: { guesses: Number(g[1]), solved, trail },
    };
  },
};
