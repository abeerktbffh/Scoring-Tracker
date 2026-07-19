// Owner-gated live write check. Proves the Sheets write path works WITHOUT
// altering any bug row: it (1) DRY-RUNS a simulated status write for a chosen
// item and prints the intended cell writes, then (2) really appends ONE row to
// the Run Log tab (additive only). Never edits a bug item's Status/Notes here.
//   set -a && . ./.env.local && set +a && npx tsx scripts/bug-automation/writecheck.mjs
import { readFileSync } from "node:fs";
import { getAccessToken, getValues, appendValues } from "../../src/lib/gsheets";
import { parseRows } from "../../src/lib/bugAutomation/sheetModel";
import { planStatusWrite } from "../../src/lib/bugAutomation/statusWrite";
import { applyWrites, formatRunLogRow } from "../../src/lib/bugAutomation/applyWrites";
import { localDateInTz } from "../../src/lib/day";
import { PLATFORM_TZ } from "../../src/lib/group";

const SHEET_ID = "1oXejKyupwd0ZqI1qI5qLF62M00-sq0EMXtVxnSdyohs";
const key = JSON.parse(readFileSync(process.env.GSHEETS_KEY_FILE, "utf8"));
const today = localDateInTz(PLATFORM_TZ);
const token = await getAccessToken(key, { nowSec: Math.floor(Date.now() / 1000) });

// (1) DRY-RUN a simulated status write for the first item — applies nothing.
const items = parseRows(await getValues(token, SHEET_ID, "Tracker!A:K"));
const sample = items[0];
console.log(`Dry-run status write for ${sample.id} (row ${sample.rowNumber}):`);
await applyWrites(planStatusWrite(sample, { kind: "buildStarted" }, today), {
  dryRun: true,
  update: async () => { throw new Error("dry-run must not write"); },
});

// (2) REAL, additive: append one Run Log row.
await appendValues(token, SHEET_ID, "Run Log!A:E", formatRunLogRow(today, { candidates: 0, built: 0, questions: 0, blocked: 0 }));
console.log("Appended a Run Log row. Confirm it appears in the Run Log tab; no bug rows were touched.");
