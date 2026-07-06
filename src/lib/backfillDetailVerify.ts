/**
 * Pure coverage summary for scripts/backfill-detail.mjs. Kept in src/lib so the
 * dry-run gating (how much of raw_input we could re-parse into detail) is
 * unit-testable without a DB. The script imports this directly (via tsx).
 */
export interface DetailCoverageInput {
  total: number;
  reparsed: number;
  failed: number;
}

export interface DetailCoverageSummary extends DetailCoverageInput {
  /** reparsed / total, rounded to 2dp. 1 when there is nothing to backfill. */
  coverage: number;
}

export function summarizeDetailCoverage(input: DetailCoverageInput): DetailCoverageSummary {
  const coverage = input.total === 0 ? 1 : Math.round((input.reparsed / input.total) * 100) / 100;
  return { ...input, coverage };
}
