# Puzzle True-Date — Design Spec

**Status:** Draft for review
**Date:** 2026-07-08
**Fixes:** a data-correctness bug — entries are bucketed by the calendar day they were *logged*, not by the puzzle they belong to, so a game's "daily" contest can mix two different puzzles.

## The bug (observed)

`POST /api/entries` stamps `puzzle_date = localDateInTz(PLATFORM_TZ)` at log time and hardcodes `is_late = false`. Scoring groups a day's contest by `gameId|puzzle_date`. Because a game's puzzle rollover doesn't align with our Asia/Kolkata day boundary — and because people log *previous* days' puzzles (catch-up) — two different puzzle numbers land in the same day's contest and get compared as if they were the same puzzle.

Concrete: today (2026-07-08) Pinpoint is **#799** (4 players logged it); DJ's row is **#798** (yesterday's, logged this morning, 1 guess), so she's compared on a different puzzle. An audit found **9 mis-filed active entries** total (DJ ×8 catch-up of Jul-7 puzzles filed as Jul-8; AyBee ×1 crossclimb Jul-6 filed as Jul-7).

## Goal

Same-day comparisons only ever compare the **same puzzle**. An entry is filed on the puzzle's **true date**, regardless of when it was logged.

## Key finding (feasibility)

Every parser-backed game carries its true date:
- **Numbered games (12)** — `puzzle_date − puzzle_number` is a single consistent per-game "epoch" across all correctly-filed data (the only outliers were the mis-filed rows). So `true_date = epoch[gameId] + puzzle_number`.
- **India Mini** — no number, but the share **URL embeds the date**: `indiamini.in/play/?id=al-crossword-mini-YYYYMMDD`.
- **Minute Cryptic** — no number, but the share **text begins with the date**: `Minute Cryptic - D Month, YYYY` (e.g. `1 July, 2026`). Parse it with a **static month-name→index lookup + direct field extraction** — NOT `new Date(str)` (which is timezone-fragile and only works because the runtime is UTC).
- **Fallback** — hand-typed/manual entries (no share text) have no identifier → keep log-date. This is a temporary case: manual entry is slated for removal, after which every entry is parsed and gets a true date.

Per-game epochs, seeded from current data (`puzzle_date − puzzle_number`; implementation re-derives/verifies these against prod before hardcoding):

| Game | epoch (date where number = 0) |
|---|---|
| wordle | 2021-06-19 |
| connections | 2023-06-11 |
| strands | 2024-03-03 |
| pinpoint | 2024-04-30 |
| queens | 2024-04-30 |
| crossclimb | 2024-04-30 |
| tango | 2024-10-07 |
| zip | 2025-03-17 |
| mini-sudoku | 2025-08-11 |
| pips | 2025-08-18 |
| patches | 2026-03-17 |
| wend | 2026-06-08 |

(`true_date = epoch + puzzle_number` days. Assumes strictly-daily numbering, which the data confirms across the observed range for every game.)

**Epoch re-derivation is a hard gate (not a note):** because a wrong epoch silently mis-files *every* entry for that game (no unique-index collision to catch it), the implementation MUST compute each epoch as the **mode of `(puzzle_date − puzzle_number)` over correctly-filed active rows** and **assert every such row agrees** with the mode (excluding the 9 known mis-files). If any game's offset isn't unanimous, stop and investigate — do not hardcode a guessed value. The values in the table above are the seed to verify against, not to trust blindly.

## Design

### 1. Parse contract
Add an optional `puzzleDate?: string | null` (ISO `YYYY-MM-DD`) to `ParseResult`.
- Numbered parsers keep emitting `puzzleNumber` unchanged (they need not compute the date themselves).
- **India Mini** and **Minute Cryptic** parsers gain a one-line extraction that sets `puzzleDate` from their embedded date (URL / header). `puzzleNumber` stays null for them.

### 2. Date-resolution helper (pure, central)
New `src/lib/puzzleDate.ts`:
- `PUZZLE_EPOCH: Record<string, string>` — the table above.
- `resolvePuzzleDate({ gameId, puzzleNumber, parsedDate }, today): string` — returns the puzzle's true date.
  - Precedence: **`parsedDate`** (embedded date the parser extracted) → **`epoch[gameId] + puzzleNumber`** (when both exist) → **`today`** (fallback for hand-typed / no identifier).
- **Missing-epoch guard:** if `puzzleNumber != null` but `gameId` is NOT in `PUZZLE_EPOCH` (a new numbered game shipped without an epoch), the helper falls back to `today` AND the caller emits the same drift signal used for parser drift today (`console.warn("[epoch-missing]", gameId)` + `Sentry.captureMessage`, mirroring `entries/route.ts`'s `[parse-failure]` handling). This prevents a silent regression to log-date bucketing.
Pure and exhaustively unit-testable (the date computation; the warn lives in the caller).

### 3. Write path
`POST /api/entries` sets `puzzle_date = resolvePuzzleDate(...)` (replacing the current `localDateInTz` line). `is_late` stays `false` (unchanged — see §4). `supersedeAndInsert` is otherwise untouched: dedup/supersede still key on `(user_id, game_id, puzzle_date, variant)` — now with the *true* date, so a per-day supersede is per-*puzzle*.

**Threading `puzzleDate`:** add `puzzleDate: string | null` to `ResolvedSubmission` (`src/lib/submission.ts`) and set it in BOTH branches of `resolveSubmission` — paste mode carries `parsed.puzzleDate` through the spread; manual mode sets `null` (no share text). The route reads `resolved.puzzleDate` (and `resolved.puzzleNumber`) into `resolvePuzzleDate`.

### 4. Catch-up logs count normally (owner-approved) — no `is_late` mechanic
A catch-up log lands on its correct day (via §1) and **competes normally on that day**, like any result. We do NOT set `is_late = true` — it stays `false` as it is today. The existing `is_late = false` filters in the read paths (`leaderboard`/`board`/`me` routes) therefore remain harmless no-ops and are **left untouched**. (Accepted tradeoff: no guard against someone logging an old puzzle after seeing its answer/others' scores — acceptable for a casual friend group; keeps the design minimal.)

### 4b. Everything downstream is unchanged
Grouping (`gameId|puzzle_date`), Today/Week/Month/All-time windows, and streaks all key on `puzzle_date`, which is now correct — so they work without modification. The reported bug is fixed purely by the date being right.

### 5. One-time backfill
A thin `scripts/backfill-puzzle-dates.mjs` (new; deny-listed like other prod scripts) + a **pure, unit-tested `src/lib/backfillPuzzleDateVerify.ts`** module (mirrors the `backfill-detail.mjs` + `backfillDetailVerify.ts` convention). For each active entry, re-parse `raw_input` (reusing `detectAndParse`) → `resolvePuzzleDate` → if the computed `puzzle_date` differs from stored, `UPDATE` **only `puzzle_date`** (never `is_late`/`parsed_value`/`solved`/`raw_input`/`detail`). `--dry-run` first (reports the changes — expected: exactly the 9 identified rows). Collision guard: if re-dating a row would hit the `entries_active_uq` slot of an existing active row, **report and skip** that row for manual review rather than clobbering. Rows without a re-parseable identifier keep their log-date.

### 6. NYT Mini
Deactivate it: `UPDATE games SET active = false WHERE id = 'nyt-mini'` on prod (reversible; its 1 entry retained). Removes the last numberless *active* game. (Same reversible flip we applied to `framed` — note that's a prod-data fact from a prior session, not represented in source; confirm against the live `games` table when applying.)

## Testing

- **`resolvePuzzleDate` helper** (pure): epoch+number math (incl. date-add correctness, no off-by-one); embedded-date precedence over number; fallback to today when no identifier; missing-epoch → returns today (and the caller-warn path is covered where it lives).
- **India Mini / Minute Cryptic parsers**: extract the embedded date from real sample share text (India Mini `…-YYYYMMDD`; Minute Cryptic `D Month, YYYY` via static month lookup — assert no `new Date` round-trip).
- **Write path**: files by true date; dedup/supersede on the true date; fallback to today when no identifier; `is_late` stays `false`.
- **`backfillPuzzleDateVerify` (pure module)**: given rows, computes which need re-dating and to what; leaves correctly-filed rows untouched; flags collisions to skip. Dry-run over a fixture set confirms it targets exactly the mis-filed rows.

## Rollout / deploy (gated — owner go-ahead)

1. Backup tag + Neon PITR point.
2. Deploy the code (parser contract + helper + write path + NYT Mini deactivation). No schema migration — `is_late`/`puzzle_number`/`puzzle_date` columns already exist.
3. Run `backfill-puzzle-dates.mjs --dry-run` against prod, confirm it targets exactly the 9 mis-filed rows, then apply.
4. Deactivate NYT Mini on prod (`active = false`).
Nothing to prod without explicit go-ahead.

## Out of scope

- Removing the manual-entry feature (a separate, upcoming change; until then, manual/typed entries keep the log-date fallback).
- Re-keying scoring by puzzle number (Approach B) — unnecessary once the date is correct.
- Non-daily / skipped-number handling — not present in any current game; if a game ever changes cadence, the consensus audit re-detects drift.
