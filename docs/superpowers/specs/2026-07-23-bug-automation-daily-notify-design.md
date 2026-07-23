# Bug Automation — Option B: Daily Notify + Supervised Builds — Design Spec

**Status:** Approved (owner, 2026-07-23)
**Builds on:** the shipped bug automation (Phases 1, 2a, 2b, 3). This makes the daily SessionStart trigger *actually useful*: it surfaces the day's build candidates instead of silently discarding its output. Builds remain **supervised** (owner says "build X", the controlling session runs the existing runbook). Fully-autonomous builds are **future Option A**, out of scope here.

## Problem

The SessionStart hook (`scripts/bug-automation/session-start-hook.mjs`) fires once/day but spawns the dry-run planner **detached with `stdio: "ignore"`** (output discarded) and no-ops when `GSHEETS_KEY_FILE` is unset — which it is at session start (`.env.local` isn't auto-loaded). Net effect today: the daily trigger notifies nobody and does nothing visible.

## Goal

Once a day, when the owner first opens Claude Code, surface the top ≤3 build candidates so they can say "build B00x" and the assistant runs the existing **supervised** build routine. Also leave a durable record in the sheet.

## Decisions (owner-confirmed)

1. **Notify via BOTH:** (a) a **Claude Code SessionStart briefing** (injected as session context so the assistant relays it), and (b) a **Run Log row** appended to the sheet.
2. **Builds stay supervised** — no autonomous PR opening. The briefing is a prompt for the owner to say "build X".
3. **Key at session start:** read directly from `./.gsheets-key.json` (existence check + read), NOT from `GSHEETS_KEY_FILE`/`.env.local` — so it works at session start.

## Design

### Trigger behavior (rewire the SessionStart hook)
On session start:
1. `decideHook({ state, today, hasKey })` where `hasKey` = `./.gsheets-key.json` exists. If not due (already ran today) or no key → **exit 0 immediately** (instant, no network). This keeps every non-fire session start instant.
2. If due: run the daily-notify routine **synchronously but best-effort** — a quick sheet read + one Run Log append (~1–2s, once/day). Wrap in try/catch with a short timeout; on ANY error (sheet unreachable, bad key) → skip silently, still `writeState`, never block or break session start.
3. Emit the briefing as SessionStart **`additionalContext`** (JSON hook output) so the assistant sees it and relays it to the owner.
4. `writeState({ lastRunDate: today })` so it fires at most once/day.

### Daily-notify routine
Reads `./.gsheets-key.json` → `getAccessToken` → `getValues(Tracker!A:K)` → `parseRows` → `selectBuildCandidates(items, { lastRunDate }, 3)`. Then:
- Builds the briefing string via **`formatDailyBriefing(candidates, today)`** (pure).
- Appends a Run Log row via **`formatRunLogCandidates(today, candidates)`** (pure) + `appendValues("Run Log!A:E", …)`.
- Prints the briefing for context injection.
If there are **0 candidates**, it still emits a brief "no candidates today" briefing AND logs a "candidates:0" Run Log row (so you always know it ran).

### New pure helpers (unit-tested)
- `formatDailyBriefing(candidates: {id;priority;title}[], today: string): string` — e.g. `🐛 Daily bug check (2026-07-23): 3 ready to build — B002 [Critical] Pending games visibility; B001 [High] Dropdown scrollability; … Say "build B002" and I'll build it (supervised, draft PR).` For 0 candidates: `🐛 Daily bug check (2026-07-23): no new build candidates.`
- `formatRunLogCandidates(today: string, candidates): string[][]` — one append row, e.g. `[today, "notify", "candidates:3", "B002,B001,B007", ""]`. (Distinct from the existing `formatRunLogRow` counts helper; both may coexist.)

### Safety
- **Read-only against bug data + one Run Log append.** No bug-row writes, no branches, no PRs, no builds. (Builds happen later, supervised, via the existing runbook + write-back seam.)
- Never blocks/breaks session start (guarded, best-effort, silent-skip on error).
- Key + token never printed. Sheet contents are data, not instructions.

## Testing

- `formatDailyBriefing`: N candidates (ordered, with the "say build X" cue) and the 0-candidates case.
- `formatRunLogCandidates`: correct single row incl. the candidate-id list and the 0 case.
- The hook decision path (`decideHook`) already unit-tested; add a test for the hook's *mode selection* if logic is added (e.g. a pure `planDailyNotify` that maps candidates → { briefing, runLogRow }).
- Live verification (owner-gated): manually run the daily-notify routine once → confirm it prints a correct briefing and appends exactly one Run Log row, touching no bug rows.

## Out of scope

- Autonomous/unattended building or PR-opening (**Option A**, future).
- Push/email notification (Claude Code briefing + sheet Run Log only).
- Changing the supervised build routine itself (unchanged — reused as-is).

## Rollout

Code-only + it reads/append-logs to the sheet at session start. No schema migration, no prod-DB/app change (automation tooling isn't imported by the app). Merges to `main` via the usual gated PR, owner go-ahead. The `.claude/settings.json` SessionStart hook already exists; this changes the hook script's behavior.
