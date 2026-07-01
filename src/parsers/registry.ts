import type { Parser, ParseResult } from "./types";
import { wordleParser } from "./wordle";
import { pipsParser } from "./pips";
import { connectionsParser } from "./connections";
import { minuteCrypticParser } from "./minuteCryptic";
import { queensParser, tangoParser, miniSudokuParser } from "./linkedin";

export const parsers: Parser[] = [
  wordleParser,
  pipsParser,
  connectionsParser,
  minuteCrypticParser,
  queensParser,
  tangoParser,
  miniSudokuParser,
];

export function detectAndParse(
  text: string,
  list: Parser[] = parsers,
): ParseResult | null {
  const parser = list.find((p) => p.detect(text));
  if (!parser) return null;
  try {
    return parser.parse(text);
  } catch {
    return null;
  }
}
