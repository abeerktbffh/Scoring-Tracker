// SessionStart hook — cheap, non-blocking. Fires the build loop at most once a
// day. In default mode it runs the DRY-RUN planner (opens/writes nothing). Only
// when BUG_AUTOMATION_BUILD=1 does it run the real loop — kept OFF until the
// owner arms it after a supervised first build.
import { spawn } from "node:child_process";
import { readState, writeState } from "../../src/lib/bugAutomation/state";
import { decideHook } from "../../src/lib/bugAutomation/hookDecision";
import { localDateInTz } from "../../src/lib/day";
import { PLATFORM_TZ } from "../../src/lib/group";

const STATE_PATH = ".superpowers/bug-automation/state.json";
const today = localDateInTz(PLATFORM_TZ);
const decision = decideHook({ state: readState(STATE_PATH), today, hasKey: Boolean(process.env.GSHEETS_KEY_FILE) });
if (!decision.fire) process.exit(0);

const armed = process.env.BUG_AUTOMATION_BUILD === "1";
// Always dry-run for now; a future step wires the real build when armed.
const args = ["tsx", "scripts/bug-automation/run-build.mjs"]; // dry-run planner
const child = spawn("npx", args, { detached: true, stdio: "ignore" });
child.unref();
writeState(STATE_PATH, { lastRunDate: today, lastRunAt: new Date().toISOString() });
console.error(`[bug-automation] daily loop launched (dry-run planner; real armed build not wired yet${armed ? ", BUG_AUTOMATION_BUILD=1 set but inert" : ""}).`);
