import { formatClock } from "./time";
import type { ResultDetail } from "@/parsers/types";

export type ResultShape = "timed" | "wordle" | "pinpoint" | "connections" | "hints";

// Per-game value shape. Everything not listed is timed (mm:ss) — including
// NYT Mini (manual, no parser) and any future timed game.
export const RESULT_SHAPE: Record<string, ResultShape> = {
  wordle: "wordle",
  pinpoint: "pinpoint",
  connections: "connections",
  strands: "hints",
  "minute-cryptic": "hints",
  pips: "timed",
  queens: "timed",
  tango: "timed",
  "mini-sudoku": "timed",
  "india-mini": "timed",
  "hindu-mini": "timed",
  "easy-down": "timed",
  zip: "timed",
  crossclimb: "timed",
  patches: "timed",
  wend: "timed",
  "nyt-mini": "timed",
};

export function shapeForGame(gameId: string): ResultShape {
  return RESULT_SHAPE[gameId] ?? "timed";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Renders a board/pill value in the game's proper units. PURE.
 * The ranking scalar `value` + `solved` are the only inputs that matter for
 * the numbers; `detail` is accepted for forward use. Never leaks the Wordle
 * sentinel 7 — a failed Wordle renders "X/6 ✗".
 */
export function formatResult(
  gameId: string,
  value: number,
  solved: boolean,
  _detail?: ResultDetail | null,
): string {
  switch (shapeForGame(gameId)) {
    case "timed":
      return formatClock(value);
    case "wordle":
      return solved ? `${value}/6 ✓` : "X/6 ✗";
    case "pinpoint":
      return plural(value, "guess", "guesses");
    case "connections":
      if (!solved) return "Failed";
      return value === 0 ? "Perfect" : plural(value, "mistake", "mistakes");
    case "hints":
      return value === 0 ? "No hints" : plural(value, "hint", "hints");
  }
}
