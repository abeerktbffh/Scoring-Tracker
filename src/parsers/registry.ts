import type { Parser, ParseResult } from "./types";
import { wordleParser } from "./wordle";

export const parsers = [wordleParser];

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
