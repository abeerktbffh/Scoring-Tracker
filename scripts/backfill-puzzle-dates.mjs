// One-time backfill: re-dates entries.puzzle_date to each puzzle's TRUE date
// (embedded date, else epoch + puzzle_number) for rows that were mis-filed
// under the old log-date behavior. Re-parses raw_input via the real parser
// registry to recover puzzleNumber/puzzleDate, then defers the actual
// re-dating decision to the pure planPuzzleDateBackfill (which also skips —
// never clobbers — a row whose target slot is already occupied by another
// active row). Touches ONLY entries.puzzle_date; never is_late, parsed_value,
// solved, raw_input, or detail.
//
// Run with tsx so it can import the REAL parser registry (single source of
// truth). NOT run by CI/agents — a guided Deploy gate step:
//   set -a && . ./.env.local && set +a && npx tsx scripts/backfill-puzzle-dates.mjs --dry-run
//   set -a && . ./.env.local && set +a && npx tsx scripts/backfill-puzzle-dates.mjs
import { neon } from "@neondatabase/serverless";
import { detectAndParse } from "../src/parsers/registry";
import { planPuzzleDateBackfill } from "../src/lib/backfillPuzzleDateVerify";
import { localDateInTz } from "../src/lib/day";
import { PLATFORM_TZ } from "../src/lib/group";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");
const today = localDateInTz(PLATFORM_TZ);

const entries = (await sql`
  SELECT id, user_id, game_id, variant, puzzle_date::text AS puzzle_date, raw_input
  FROM entries
  WHERE superseded_by IS NULL AND raw_input IS NOT NULL
`);

const rows = [];
for (const e of entries) {
  const parsed = detectAndParse(e.raw_input);
  rows.push({
    id: e.id,
    userId: e.user_id,
    gameId: e.game_id,
    variant: e.variant,
    puzzleNumber: parsed?.puzzleNumber ?? null,
    parsedDate: parsed?.puzzleDate ?? null,
    puzzleDate: e.puzzle_date,
  });
}

const { updates, skips } = planPuzzleDateBackfill(rows, today);

console.log(dryRun ? "[dry-run]" : "[applying]", "updates:", updates.length, "skips:", skips.length);
console.log("updates:", updates);
console.log("skips:", skips);

if (!dryRun) {
  for (const u of updates) {
    await sql`UPDATE entries SET puzzle_date = ${u.to} WHERE id = ${u.id}`;
  }
}
