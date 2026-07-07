// Re-parse existing entries.raw_input into entries.detail (display/analytics
// only; never touches parsed_value/solved). Idempotent: only touches rows
// where detail IS NULL. Best-effort — rows that fail to re-parse keep
// detail = NULL and fall back to scalar display (no data loss).
//
// Run with tsx so it can import the REAL parser registry (single source of
// truth). NOT run by CI/agents — a guided Deploy gate step:
//   set -a && . ./.env.local && set +a && npx tsx scripts/backfill-detail.mjs --dry-run
//   set -a && . ./.env.local && set +a && npx tsx scripts/backfill-detail.mjs
import { neon } from "@neondatabase/serverless";
import { detectAndParse } from "../src/parsers/registry";
import { summarizeDetailCoverage } from "../src/lib/backfillDetailVerify";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");

const rows = await sql`
  SELECT id, raw_input FROM entries
  WHERE detail IS NULL AND raw_input IS NOT NULL
`;

let reparsed = 0;
let failed = 0;
for (const r of rows) {
  const parsed = detectAndParse(r.raw_input);
  if (!parsed || !parsed.detail) {
    failed++;
    continue;
  }
  reparsed++;
  if (!dryRun) {
    await sql`UPDATE entries SET detail = ${JSON.stringify(parsed.detail)}::jsonb WHERE id = ${r.id}`;
  }
}

const summary = summarizeDetailCoverage({ total: rows.length, reparsed, failed });
console.log(dryRun ? "[dry-run]" : "[applied]", summary);
