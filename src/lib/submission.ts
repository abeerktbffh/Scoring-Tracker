import { detectAndParse } from "@/parsers/registry";
import type { ParseResult, ResultDetail } from "@/parsers/types";

export interface ResolvedSubmission {
  gameId: string;
  variant: string | null;
  value: number;
  solved: boolean;
  puzzleNumber: number | null;
  puzzleDate: string | null;
  rawInput: string | null;
  detail?: ResultDetail | null;
}

export interface SubmissionError {
  error: string;
  status: number;
}

type Detector = (text: string) => ParseResult | null;

export function resolveSubmission(
  body: unknown,
  detect: Detector = detectAndParse,
): ResolvedSubmission | SubmissionError {
  const b = (body ?? {}) as Record<string, unknown>;

  // Paste mode
  if (typeof b.rawInput === "string" && b.rawInput.length > 0) {
    const parsed = detect(b.rawInput);
    if (!parsed) return { error: "Could not parse result", status: 422 };
    return { ...parsed, puzzleDate: parsed.puzzleDate ?? null, rawInput: b.rawInput };
  }

  // Manual mode
  if (
    typeof b.gameId === "string" && b.gameId.length > 0 &&
    typeof b.value === "number" && Number.isFinite(b.value) &&
    typeof b.solved === "boolean"
  ) {
    return {
      gameId: b.gameId,
      variant: typeof b.variant === "string" && b.variant.length > 0 ? b.variant : null,
      value: b.value,
      solved: b.solved,
      puzzleNumber: null,
      puzzleDate: null,
      rawInput: null,
    };
  }

  return { error: "Missing or invalid fields", status: 400 };
}
