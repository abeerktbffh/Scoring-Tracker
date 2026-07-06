import type { Parser, ParseResult } from "./types";

const HEADER = /^Strands\s+#(\d+)/im;
const HINT = /💡/gu;

export const strandsParser: Parser = {
  gameId: "strands",
  detect(text: string): boolean {
    return HEADER.test(text);
  },
  parse(text: string): ParseResult {
    const h = text.match(HEADER);
    if (!h) throw new Error("Not a Strands result");
    // Score is the number of hints used (💡). Sharing implies a completed board.
    const hints = (text.match(HINT) ?? []).length;
    const theme = text.match(/"([^"]+)"/)?.[1] ?? null;
    const SQ = /[🔵🟡💡]/gu;
    const grid = text
      .split("\n")
      .map((line) => [...line.matchAll(SQ)].map((m) => m[0]))
      .filter((sq) => sq.length > 0)
      .map((sq) => sq.join(""));
    return {
      gameId: "strands",
      puzzleNumber: Number(h[1]),
      variant: null,
      value: hints,
      solved: true,
      detail: { hints, theme, grid },
    };
  },
};
