/**
 * Structured per-result detail — display/analytics only. NEVER a ranking
 * input (the scalar `value` + `solved` remain the sole ranking inputs).
 * One open shape covers every game; each parser fills only its own fields.
 * Stored verbatim in `entries.detail JSONB`.
 */
export interface ResultDetail {
  // Guesses (Wordle, Pinpoint)
  guesses?: number | null;
  solved?: boolean;
  hardMode?: boolean;       // Wordle
  trail?: number[];         // Pinpoint %-match trail
  // Mistakes (Connections)
  mistakes?: number;
  solvedAll?: boolean;
  // Hints (Strands, Minute Cryptic)
  hints?: number;
  theme?: string | null;    // Strands
  underPar?: number | null; // Minute Cryptic
  // Timed (Queens/Tango/Mini Sudoku/India Mini/NYT Mini/Zip/Crossclimb/Patches/Wend/Pips)
  seconds?: number;
  backtracks?: number;      // Zip
  redraws?: number;         // Patches
  fillOrder?: number[];     // Crossclimb
  difficulty?: string;      // Pips (easy/medium/hard)
  // Shared verbatim grid (Wordle/Connections/Strands)
  grid?: string[];
}

export interface ParseResult {
  gameId: string;
  puzzleNumber: number | null;
  variant: string | null;
  value: number;
  solved: boolean;
  /** Optional structured detail; display/analytics only. */
  detail?: ResultDetail | null;
}

export interface Parser {
  gameId: string;
  detect(text: string): boolean;
  parse(text: string): ParseResult;
}
