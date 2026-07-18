// Phase 1 — READ-ONLY daily triage. Reads the Bragboard Tasks Tracker sheet,
// prints a ranked triage summary, updates the local run-state file. Writes
// NOTHING to the sheet and builds NOTHING (Phase 1 has no write path).
//   set -a && . ./.env.local && set +a && npx tsx scripts/bug-automation/run-triage.mjs
import { readFileSync } from "node:fs";
import { getAccessToken, getValues } from "../../src/lib/gsheets";
import { parseRows } from "../../src/lib/bugAutomation/sheetModel";
import { buildTriageSummary } from "../../src/lib/bugAutomation/triage";
import { readState, writeState } from "../../src/lib/bugAutomation/state";
import { localDateInTz } from "../../src/lib/day";
import { PLATFORM_TZ } from "../../src/lib/group";

const SHEET_ID = "1HSNw7eimmBMe-B5tSCSKEBHZCt1oaxW7";
const RANGE = "Tracker!A:K"; // unbounded — won't silently truncate as the tracker grows
const STATE_PATH = ".superpowers/bug-automation/state.json";

const keyPath = process.env.GSHEETS_KEY_FILE;
if (!keyPath) {
  console.error("[bug-automation] GSHEETS_KEY_FILE not set — skipping (no key configured).");
  process.exit(0);
}
let key;
try {
  key = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  // Missing file, bad path, or malformed JSON — this is reused by the Phase 3
  // SessionStart hook, so it must no-op gracefully instead of throwing noisily.
  console.error("[bug-automation] could not read GSHEETS_KEY_FILE — skipping.");
  process.exit(0);
}
const today = localDateInTz(PLATFORM_TZ);

const token = await getAccessToken(key, { nowSec: Math.floor(Date.now() / 1000) });
const values = await getValues(token, SHEET_ID, RANGE);
const items = parseRows(values);

const state = readState(STATE_PATH);
console.log(buildTriageSummary(items, { today, lastRunDate: state.lastRunDate }));

writeState(STATE_PATH, { lastRunDate: today, lastRunAt: new Date().toISOString() });
