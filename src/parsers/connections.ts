import type { Parser, ParseResult } from "./types";

const HEADER = /^Connections/im;
const PUZZLE = /Puzzle #(\d+)/i;
const SQUARE = /[🟩🟦🟪🟨🟧🟥]/gu;

export const connectionsParser: Parser = {
  gameId: "connections",
  detect(text: string): boolean {
    return HEADER.test(text) && PUZZLE.test(text);
  },
  parse(text: string): ParseResult {
    const p = text.match(PUZZLE);
    if (!p) throw new Error("Not a Connections result");
    const rows = text
      .split("\n")
      .map((line) => [...line.matchAll(SQUARE)].map((m) => m[0]))
      .filter((squares) => squares.length === 4);
    if (rows.length === 0) throw new Error("No Connections grid found");
    const mono = rows.filter((r) => r.every((c) => c === r[0])).length;
    return {
      gameId: "connections",
      puzzleNumber: Number(p[1]),
      variant: null,
      value: rows.length - mono,
      solved: mono === 4,
      detail: {
        mistakes: rows.length - mono,
        solvedAll: mono === 4,
        grid: rows.map((r) => r.join("")),
      },
    };
  },
};
