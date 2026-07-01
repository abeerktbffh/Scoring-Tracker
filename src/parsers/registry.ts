import type { ParseResult } from "./types";
import { wordleParser } from "./wordle";

export const parsers = [wordleParser];

export function detectAndParse(text: string): ParseResult | null {
  const parser = parsers.find((p) => p.detect(text));
  if (!parser) return null;
  try {
    return parser.parse(text);
  } catch {
    return null;
  }
}
