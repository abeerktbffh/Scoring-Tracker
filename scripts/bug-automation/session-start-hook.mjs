// SessionStart hook — cheap, non-blocking, at most once a day. When due, it
// reads the bug tracker, selects the top build candidates, appends one Run Log
// row, and emits a daily briefing to Claude Code as SessionStart context so the
// assistant can relay it. It NEVER builds, opens PRs, or writes bug rows
// (builds are supervised). Best-effort: any error → skip silently, never block
// session start. Key is read from ./.gsheets-key.json directly.
import { existsSync, readFileSync } from "node:fs";
import { readState, writeState } from "../../src/lib/bugAutomation/state";
import { decideHook } from "../../src/lib/bugAutomation/hookDecision";
import { getAccessToken, getValues, appendValues } from "../../src/lib/gsheets";
import { parseRows } from "../../src/lib/bugAutomation/sheetModel";
import { selectBuildCandidates } from "../../src/lib/bugAutomation/select";
import { formatDailyBriefing, formatRunLogCandidates } from "../../src/lib/bugAutomation/dailyBriefing";
import { localDateInTz } from "../../src/lib/day";
import { PLATFORM_TZ } from "../../src/lib/group";

const SHEET_ID = "1oXejKyupwd0ZqI1qI5qLF62M00-sq0EMXtVxnSdyohs";
const STATE_PATH = ".superpowers/bug-automation/state.json";
const KEY_PATH = "./.gsheets-key.json";

const today = localDateInTz(PLATFORM_TZ);
const state = readState(STATE_PATH);
const decision = decideHook({ state, today, hasKey: existsSync(KEY_PATH) });
if (!decision.fire) process.exit(0);

let context = null;
try {
  const key = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  const token = await getAccessToken(key, { nowSec: Math.floor(Date.now() / 1000) });
  const items = parseRows(await getValues(token, SHEET_ID, "Tracker!A:K"));
  const candidates = selectBuildCandidates(items, { lastRunDate: state.lastRunDate }, 3);
  context = formatDailyBriefing(candidates, today);
  await appendValues(token, SHEET_ID, "Run Log!A:E", formatRunLogCandidates(today, candidates));
} catch {
  context = null; // best-effort: on any error, skip silently
}

// Write state even on error so a transient failure doesn't retry-spam today.
writeState(STATE_PATH, { lastRunDate: today, lastRunAt: new Date().toISOString() });

if (context) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }),
  );
}
process.exit(0);
