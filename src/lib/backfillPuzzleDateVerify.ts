import { resolvePuzzleDate } from "./puzzleDate";

export interface BackfillRow {
  id: string;
  userId: string;
  gameId: string;
  variant: string | null;
  puzzleNumber: number | null;
  parsedDate: string | null;
  puzzleDate: string; // current stored date
}

/**
 * Decides which rows to re-date to their true puzzle date. Pure. A row with
 * no re-parseable identifier (resolvePuzzleDate falls back to `today`) is
 * left untouched — a backfill must never fabricate a date from the arbitrary
 * day the script happens to run on. Otherwise a row is updated when its
 * computed true date differs from the stored one, and skipped (never
 * clobbered) when re-dating would land on the active slot
 * (userId, gameId, variant, targetDate) of another row.
 */
export function planPuzzleDateBackfill(
  rows: BackfillRow[],
  today: string,
): { updates: { id: string; from: string; to: string }[]; skips: { id: string; reason: string }[] } {
  const slot = (userId: string, gameId: string, variant: string | null, date: string) =>
    `${userId}|${gameId}|${variant ?? ""}|${date}`;
  const occupied = new Set(rows.map((r) => slot(r.userId, r.gameId, r.variant, r.puzzleDate)));

  const updates: { id: string; from: string; to: string }[] = [];
  const skips: { id: string; reason: string }[] = [];
  for (const r of rows) {
    const resolved = resolvePuzzleDate({ gameId: r.gameId, puzzleNumber: r.puzzleNumber, parsedDate: r.parsedDate }, today);
    if (resolved.source === "fallback") continue;
    const to = resolved.date;
    if (to === r.puzzleDate) continue;
    const target = slot(r.userId, r.gameId, r.variant, to);
    if (occupied.has(target)) {
      skips.push({ id: r.id, reason: `target slot ${to} already occupied` });
      continue;
    }
    occupied.add(target);
    occupied.delete(slot(r.userId, r.gameId, r.variant, r.puzzleDate));
    updates.push({ id: r.id, from: r.puzzleDate, to });
  }
  return { updates, skips };
}
