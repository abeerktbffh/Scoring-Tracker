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
- **Minute Cryptic** — no number, but the share **text begins with the date**: `Minute Cryptic - D Month, YYYY`.
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

## Design

### 1. Parse contract
Add an optional `puzzleDate?: string | null` (ISO `YYYY-MM-DD`) to `ParseResult`.
- Numbered parsers keep emitting `puzzleNumber` unchanged (they need not compute the date themselves).
- **India Mini** and **Minute Cryptic** parsers gain a one-line extraction that sets `puzzleDate` from their embedded date (URL / header). `puzzleNumber` stays null for them.

### 2. Date-resolution helper (pure, central)
New `src/lib/puzzleDate.ts`:
- `PUZZLE_EPOCH: Record<string, string>` — the table above.
- `resolvePuzzleDate({ gameId, puzzleNumber, parsedDate }, today): { puzzleDate: string; isLate: boolean }`
  - Precedence: **`parsedDate`** (embedded) → **`epoch[gameId] + puzzleNumber`** (when both exist) → **`today`** (fallback).
  - `isLate = puzzleDate < today` (a catch-up log of a past puzzle).
Pure and exhaustively unit-testable.

### 3. Write path
`POST /api/entries` uses `resolvePuzzleDate(...)` to set BOTH `puzzle_date` (replacing the current `localDateInTz` line) and `is_late` (replacing the hardcoded `false`). Nothing else in `supersedeAndInsert` changes: dedup/supersede still key on `(user_id, game_id, puzzle_date, variant)` — now with the *true* date, so a per-day supersede is per-*puzzle*.

### 4. Everything downstream is unchanged
Grouping (`gameId|puzzle_date`), Today/Week/Month/All-time windows, and streaks all key on `puzzle_date`, which is now correct — so they work without modification. `is_late` entries are **excluded from win/medal tallies** (this is the existing, until-now-dormant `is_late` behavior) but are still stored and shown on their true day. **Behavior (owner-approved):** a late/catch-up log lands on its correct day but does not count toward standings.

### 5. One-time backfill
`scripts/backfill-puzzle-dates.mjs` (new; deny-listed like other prod scripts): for each active entry, re-parse `raw_input` (reusing `detectAndParse`) → `resolvePuzzleDate` → if the computed `puzzle_date`/`is_late` differ from stored, `UPDATE` them. Only `puzzle_date` + `is_late` are written; never `parsed_value`/`solved`/`raw_input`/`detail`. `--dry-run` first (reports the changes — expected: the 9 identified rows + any is_late re-flags). Guard the rare unique-index collision (re-dating onto an occupied slot): report and skip such rows for manual review rather than clobbering. Rows without a re-parseable identifier keep their log-date.

### 6. NYT Mini
Deactivate it (`games.active = false`), consistent with how Framed was handled (reversible; its 1 entry retained). Removes the last numberless *active* game.

## Testing

- **`puzzleDate` helper** (pure): epoch+number math; embedded-date precedence; fallback to today; `isLate` boundary (true date = today → not late; < today → late).
- **India Mini / Minute Cryptic parsers**: extract the embedded date from real sample share text.
- **Write path**: files by true date; dedup/supersede on the true date; sets `is_late` correctly; fallback to today when no identifier.
- **Backfill**: dry-run over a fixture set re-dates a mis-filed row and flags late; leaves correctly-filed rows untouched; collision rows are skipped, not clobbered.

## Rollout / deploy (gated — owner go-ahead)

1. Backup tag + Neon PITR point.
2. Deploy the code (parser contract + helper + write path + NYT Mini deactivation). No schema migration — `is_late`/`puzzle_number`/`puzzle_date` columns already exist.
3. Run `backfill-puzzle-dates.mjs --dry-run` against prod, confirm it targets the 9 (+ any is_late re-flags), then apply.
4. Deactivate NYT Mini on prod (`active = false`).
Nothing to prod without explicit go-ahead.

## Out of scope

- Removing the manual-entry feature (a separate, upcoming change; until then, manual/typed entries keep the log-date fallback).
- Re-keying scoring by puzzle number (Approach B) — unnecessary once the date is correct.
- Non-daily / skipped-number handling — not present in any current game; if a game ever changes cadence, the consensus audit re-detects drift.
