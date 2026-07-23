/**
 * Per-game "go play it" URLs (feature F002). Code map — no DB column.
 * A game with no entry here shows no play icon.
 */
export const GAME_URLS: Record<string, string> = {
  wordle: "https://www.nytimes.com/games/wordle/index.html",
  connections: "https://www.nytimes.com/games/connections",
  strands: "https://www.nytimes.com/games/strands",
  pips: "https://www.nytimes.com/games/pips",
  queens: "https://www.linkedin.com/games/queens/",
  tango: "https://www.linkedin.com/games/tango/",
  pinpoint: "https://www.linkedin.com/games/pinpoint/",
  crossclimb: "https://www.linkedin.com/games/crossclimb/",
  zip: "https://www.linkedin.com/games/zip/",
  "minute-cryptic": "https://minutecryptic.com/",
  "india-mini": "https://indiamini.in/play/",
  "hindu-mini": "https://www.thehindu.com/crosswords/thehindu-mini-crossword/",
  "easy-down": "https://www.thehindu.com/crosswords/hindu-one-down/",
  // Best-guess LinkedIn slugs — OWNER TO VERIFY (tap to check); drop if wrong.
  "mini-sudoku": "https://www.linkedin.com/games/mini-sudoku/",
  patches: "https://www.linkedin.com/games/patches/",
  wend: "https://www.linkedin.com/games/wend/",
};

export function gameUrl(gameId: string): string | null {
  return GAME_URLS[gameId] ?? null;
}
