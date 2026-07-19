// Bug-automation build loop — PLANNER / DRY-RUN entry. Reads the sheet, selects
// up to 3 candidates, and prints the intended actions. It NEVER builds, opens a
// PR, or writes to the sheet by itself — those happen in the controlling Claude
// session per docs/bug-automation-build-runbook.md, using the glue helpers.
//   Dry-run (default):  set -a && . ./.env.local && set +a && npx tsx scripts/bug-automation/run-build.mjs
//   Emit plan as JSON:  ... npx tsx scripts/bug-automation/run-build.mjs --emit-plan
import { readFileSync } from "node:fs";
import { getAccessToken, getValues } from "../../src/lib/gsheets";
import { parseRows } from "../../src/lib/bugAutomation/sheetModel";
import { selectBuildCandidates } from "../../src/lib/bugAutomation/select";
import { buildBranchName } from "../../src/lib/bugAutomation/branchName";
import { readState } from "../../src/lib/bugAutomation/state";
import { localDateInTz } from "../../src/lib/day";
import { PLATFORM_TZ } from "../../src/lib/group";

const SHEET_ID = "1oXejKyupwd0ZqI1qI5qLF62M00-sq0EMXtVxnSdyohs";
const STATE_PATH = ".superpowers/bug-automation/state.json";
const emitPlan = process.argv.includes("--emit-plan");

const keyPath = process.env.GSHEETS_KEY_FILE;
if (!keyPath) { console.error("[bug-automation] GSHEETS_KEY_FILE not set — skipping."); process.exit(0); }
let key;
try { key = JSON.parse(readFileSync(keyPath, "utf8")); }
catch { console.error("[bug-automation] could not read GSHEETS_KEY_FILE — skipping."); process.exit(0); }

const today = localDateInTz(PLATFORM_TZ);
const token = await getAccessToken(key, { nowSec: Math.floor(Date.now() / 1000) });
const items = parseRows(await getValues(token, SHEET_ID, "Tracker!A:K"));
const state = readState(STATE_PATH);
const candidates = selectBuildCandidates(items, { lastRunDate: state.lastRunDate }, 3);

if (emitPlan) {
  console.log(JSON.stringify(candidates.map((c) => ({ id: c.id, rowNumber: c.rowNumber, priority: c.priority, title: c.title, description: c.description, branch: buildBranchName(c) })), null, 2));
} else {
  console.log(`[dry-run] ${candidates.length} build candidate(s) for ${today}. NOTHING will be built/opened/written.`);
  for (const c of candidates) {
    console.log(`- ${c.id} [${c.priority}] ${c.title}`);
    console.log(`    branch:        ${buildBranchName(c)}`);
    console.log(`    would: recordOutcome(buildStarted) -> Tracker!F${c.rowNumber} = "In Progress"`);
    console.log(`    would: run build sub-routine (runbook) -> open DRAFT PR -> recordOutcome(prOpened, <url>)`);
  }
}
