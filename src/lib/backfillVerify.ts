/**
 * Pure verification logic for the Phase 1 identity backfill
 * (scripts/backfill-phase1.mjs). Kept separate from the script itself so the
 * gating decisions are unit-testable without a database connection.
 */

export interface NameCollisionRow {
  n: string;
  c: number;
}

export interface CountRow {
  c: number | string;
}

export interface BackfillCheckRows {
  /** `SELECT lower(display_name) AS n, count(*) c FROM users ... GROUP BY 1 HAVING count(*) > 1` */
  nameCollisionRows: NameCollisionRow[];
  /** `SELECT count(*) c FROM entries WHERE user_id IS NULL AND player_id IS NOT NULL` */
  entriesMissingUserIdRows: CountRow[];
  /** `SELECT count(*) c FROM users WHERE display_name IS NULL` */
  usersMissingNameRows: CountRow[];
}

export interface BackfillSummary {
  /** False if there is any name collision or any entry still missing a backfilled user_id (the two hard gates). */
  ok: boolean;
  nameCollisions: NameCollisionRow[];
  entriesMissingUserId: number;
  /** Informational only — not a hard gate. Surfaced for visibility (e.g. a user with no players row ever set one). */
  usersMissingName: number;
}

/**
 * Reduces the raw query results from the backfill's verification steps into
 * a single pass/fail summary. `ok` is false if there is any case-insensitive
 * display-name collision, or any entry that should have a user_id (it has a
 * player_id) but doesn't. `usersMissingName` is reported but does not affect
 * `ok` — the backfill script does not hard-gate on it.
 */
export function summarize(rows: BackfillCheckRows): BackfillSummary {
  const nameCollisions = rows.nameCollisionRows;
  const entriesMissingUserId = Number(rows.entriesMissingUserIdRows[0]?.c ?? 0);
  const usersMissingName = Number(rows.usersMissingNameRows[0]?.c ?? 0);

  const ok = nameCollisions.length === 0 && entriesMissingUserId === 0;

  return { ok, nameCollisions, entriesMissingUserId, usersMissingName };
}
