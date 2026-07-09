import { toDayNumber, fromDayNumber } from "./day";

/**
 * Per-game "epoch" = the date on which puzzle number 0 would fall, so
 * true_date = epoch + puzzleNumber days. Derived as the mode of
 * (puzzle_date - puzzle_number) over correctly-filed prod rows (unanimous
 * per game). A numbered game MUST appear here; a missing entry falls back to
 * today and the caller emits an [epoch-missing] warning.
 */
export const PUZZLE_EPOCH: Record<string, string> = {
  wordle: "2021-06-19",
  connections: "2023-06-11",
  strands: "2024-03-03",
  pinpoint: "2024-04-30",
  queens: "2024-04-30",
  crossclimb: "2024-04-30",
  tango: "2024-10-07",
  zip: "2025-03-17",
  "mini-sudoku": "2025-08-11",
  pips: "2025-08-18",
  patches: "2026-03-17",
  wend: "2026-06-08",
};

export type PuzzleDateSource = "parsed" | "epoch" | "fallback";

/**
 * The puzzle's true date. Precedence: an embedded date the parser extracted →
 * epoch + puzzleNumber → today (fallback). `source` lets the caller warn when
 * a numbered game fell back for lack of an epoch.
 */
export function resolvePuzzleDate(
  input: { gameId: string; puzzleNumber: number | null; parsedDate?: string | null },
  today: string,
): { date: string; source: PuzzleDateSource } {
  if (input.parsedDate) return { date: input.parsedDate, source: "parsed" };
  const epoch = PUZZLE_EPOCH[input.gameId];
  if (input.puzzleNumber != null && epoch) {
    return { date: fromDayNumber(toDayNumber(epoch) + input.puzzleNumber), source: "epoch" };
  }
  return { date: today, source: "fallback" };
}
