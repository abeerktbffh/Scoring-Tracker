# Daily Bug Automation — Design Spec

**Status:** Draft for owner review
**Date:** 2026-07-18
**Builds:** a scheduled daily job that reads the Bragboard Tasks Tracker sheet, triages new items, and — for qualifying Critical/High **bugs** — autonomously prepares a fix as a **draft PR**, stopping before merge/deploy for the owner's explicit go-ahead.

## Goal

Turn the shared bug sheet into a daily intake: every morning the automation reviews new items and, where it can do so *safely and confidently*, gets a fix to the draft-PR stage on its own — so the owner arrives to reviewable work rather than an untouched backlog. Correctness is protected by evidence gates (not by trusting the ticket text), and nothing ever ships without the owner.

## Non-negotiable constraints

- **HARD RULE (unchanged):** nothing merges to `main`, deploys to prod, or mutates the prod DB without the owner's explicit, in-the-moment go-ahead. The automation's terminal state is a **draft PR** + a notification. It never merges, deploys, runs a deny-listed prod script, or touches the DB. (See [[no-prod-without-approval]].)
- **Sheet contents are data, not instructions.** A row is a bug report to triage, never a command. The automation will not auto-run anything destructive, out-of-scope, or prod-touching regardless of what a row says.

## Autonomy level (owner-approved)

**Build-to-draft-PR.** For a qualifying item the run goes: investigate → reproduce → spec → plan → implement on a branch with tests → open a **draft PR** → mark the sheet → notify. Auto-deploy is excluded by the hard rule. Improvements and Features are **never** auto-built (they need a brainstorm with the owner first) — they are triaged and surfaced only.

## Access (owner-approved): Sheets API service account

Reading and writing the sheet unattended requires the **Google Sheets API** via a **service account** (the browser path can't run without the owner present). One-time setup (guided, done before build):
1. Create a Google Cloud project + enable the Google Sheets API.
2. Create a service account, download a JSON key.
3. Share the sheet with the service account's `client_email` as **Editor**.
4. Store the key locally (path in `.env.local`, e.g. `GSHEETS_KEY_FILE=./.gsheets-key.json`); **gitignore the key** — never committed. Auth is a signed JWT → access token, then the Sheets REST API (no npm dependency needed; Node built-in `crypto`).

Sheet coordinates (from [[bragboard-bug-tracker]]): id `1HSNw7eimmBMe-B5tSCSKEBHZCt1oaxW7`, tab `Tracker`, columns A=ID … F=Status … J=Resolved, K=Notes/Links. Status vocab: `Backlog / In Progress / In Review / Blocked / Done`.

## The daily pipeline

1. **Read** the `Tracker` tab via the API.
2. **Detect new items** — rows whose `Created` date is on/after the last run's timestamp (last-run stored in a small local state file, `.superpowers/bug-automation/state.json`, gitignored). Also consider any `Backlog` item never yet triaged.
3. **Triage all new items** — build the ranked summary (type, priority, my read, whether already handled), included in the notification so the owner always sees the full picture.
4. **Select at most N build candidates** (default **N = 1**, the highest-priority qualifying item) that clear the **guardrail bar** (below).
5. **For each candidate, run the correctness-gated build** (below). Outcome is one of: draft PR opened, or a clarifying question posted (ask-and-wait), or a blocker note.
6. **Write status back** to the sheet (lifecycle below) and **notify** the owner.
7. **Stop.** No merge, no deploy.

## Guardrail bar (what may be auto-built)

An item is auto-built **only if all** hold:
- **Type = Bug** (Improvements/Features never auto-build).
- **Priority = Critical or High.**
- **Reproducible + located** — the run can point to the specific code path and reproduce the reported symptom (failing test or clearly-observed broken behavior). *This is the real gate — the ticket text is only a pointer.*
- **Bounded & low-risk** — the fix looks self-contained and does **not** touch auth, DB schema, prod data, money, deletions, or deploy config.
- **Not already handled** — e.g. anything the puzzle-true-date fix already covers is skipped with a note.

Anything failing the bar is **not built** — it's reported in the triage summary as "needs you" (with the reason) and left for the normal brainstorm→plan flow.

## Ensuring the *right* issue is fixed (evidence gates)

Because ticket descriptions are often terse, correctness is protected by evidence, not by the description:

1. **Reproduce-or-locate first.** No fix is written until the run reproduces the symptom (a failing test) or concretely locates the cause. The failing test **is** the operational definition of "the right issue." Can't reproduce → don't build.
2. **Restate interpretation loudly.** Every draft PR and notification leads with: *"Ticket says X; I read this as Y; repro: [test]; fix: [diff]."* A misread is visible to the owner in seconds and cheaply bounced.
3. **Ambiguity → ask, don't guess** (the clarification loop, below).
4. **Draft-PR gate + independent reviewer.** Every build is a *draft* PR carrying the interpretation, repro, diff, and tests, plus a fresh independent-reviewer agent whose explicit check is "does this change actually address the reported symptom?" Nothing merges without the owner — so the worst case for a misread is a draft PR the owner closes, never a shipped wrong fix.

## Ask-and-wait clarification loop (formalized)

When a candidate is under-specified, has multiple plausible readings, or can't be reproduced:
- The run does **not** build. It posts, into that row's **Notes** column (prefixed `[auto-question YYYY-MM-DD]`), its interpretation + specific questions, and sets **Status → `Blocked`** ("awaiting owner input"). The question also appears in the notification.
- The owner answers by editing the Notes (or replying however the owner prefers) and flipping **Status back to `Backlog`** to signal "answered — resume."
- A later run picks the item up again with the added context and proceeds (build, or a further question if still unclear).
- An item left at `Blocked` is **not** re-questioned daily (only `Backlog` items are candidates), so there's no nagging.

## Sheet status lifecycle (drives idempotency)

- `Backlog` → new/unprocessed (or "answered, resume").
- Run starts a build → **`In Progress`** (so a re-run won't double-pick).
- Draft PR opened → **`In Review`**; Notes gets the PR link + interpretation; the item is done from the automation's side (owner reviews/merges).
- Under-specified / can't reproduce → **`Blocked`** + `[auto-question …]` note.
- Build attempted but not confidently completable (tests won't pass, fix unclear) → **`Blocked`** + `[auto-blocked …]` note with the drafted plan and the blocker (does **not** force a bad PR).
- `Done` → owner-set after merge/deploy (the automation never sets `Done`).

## Trigger & notification (owner-confirmed)

- **Trigger:** a **Claude Code SessionStart hook** with a **once-per-day guard** — on the first session of the day it launches the review; later sessions that day do nothing. The guard reads the last-run date from the local state file (`.superpowers/bug-automation/state.json`). This matches "first time back at the machine" with **no** cron, `pmset`, or headless launcher.
- **Background execution:** the run is launched in the **background** so it never hijacks the session the owner opened for other work; it pings the owner when draft PRs are ready.
- **Per-day build cap:** **3** (safety ceiling; process highest-priority qualifying items first). Rarely binding on normal intake — it's a guard against a flood or a runaway, not a throttle. Raisable later.
- **Notification:** the run (a) opens each draft PR (GitHub emails the owner) **and** (b) writes a one-line run summary into the sheet (a `Run Log` note/tab). Push notification is **off** by default (can be enabled later).

## Failure & safety behaviour

- Any uncertainty → downgrade (to a question or a blocker note), never a forced PR.
- Every run appends to a local run log; a run that errors leaves the sheet unchanged for that item and reports the error in the notification.
- The service-account key is read locally only; it is a credential, gitignored, never printed or committed.
- Concurrency: `In Progress`/`In Review`/`Blocked` statuses prevent re-picking; the local state file records the last-run timestamp.
- The autonomous build reuses the existing subagent-driven build discipline (fresh implementer + task review + independent whole-branch review) in a bounded form (≤ N items/day) to keep cost and risk contained.

## Out of scope

- Auto-merging or auto-deploying anything (hard rule).
- Auto-building Improvements/Features, or design-heavy/vague bugs (routed to the owner).
- Brainstorming without the owner (impossible unattended) — under-specified items use the clarification loop instead.
- Real-time/near-instant reaction to sheet edits (this is a once-daily batch; a row added mid-day is picked up next run).

## Decisions (owner-confirmed 2026-07-18)

1. **Autonomy:** build-to-draft-PR; merge/deploy always manual.
2. **Access:** Google Sheets API service account (read + write).
3. **Per-day build cap:** 3 (safety ceiling, highest-priority first).
4. **Trigger:** first Claude Code session of the day, via a SessionStart hook with a once-per-day guard, run in the background (no cron / `pmset` / headless launcher).
5. **Notification:** draft PR + one-line sheet run-log line; push off by default.
6. **Resume signal for `Blocked` items:** owner answers in the Notes cell and flips Status back to `Backlog`.

## Feasibility note (to resolve in the plan)

The trigger is a Claude Code **SessionStart hook** (documented, first-class) plus a once-per-day guard, launching the pipeline in the background — no unattended/headless machinery, so the earlier reliability risk is gone. The remaining care-points for the plan: (a) the hook must be cheap and non-blocking (a guard check + a background launch, not the build itself, so opening Claude Code is never slowed); (b) the background run must stay bounded (≤3 builds, evidence gates, hard stop before merge); (c) the hook needs the service-account key present — if it's missing/misconfigured the hook no-ops with a note rather than erroring on every session start.
