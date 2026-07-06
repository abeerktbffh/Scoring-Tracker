# Leaderboard & Scoring Redesign — Design Spec

**Status:** Draft for review
**Date:** 2026-07-06
**Depends on:** multi-group (live), the existing parser/scoring/board stack
**Enables (future):** auto-import (the structured result model this defines is what auto-import will populate)

## Goal

Make results read properly per game (real units, solved/failed), make **per-game boards the star** ranked by **daily wins (medals)** with a **light overall medal tally**, and let friends **see the process** (grids/stats) via a **today-only inline collapsible** — all underpinned by a **structured per-result data model** that replaces today's single-scalar storage and sets up auto-import.

## Guiding principle: keep the UI simple

Owner-stated, binding across the whole design. Collapsed leaderboard rows stay minimal (rank · name · value-or-medals · a chevron where expandable). All richness (stat pills, grids, extra metrics) lives inside the collapsible, revealed only on tap. One control row on the Board screen (game + window dropdowns), the group switcher stays in the top bar. No stat overload, no third filter strip. When in doubt, hide detail behind a tap rather than crowd the row.

## The core problem (today)

Every result is stored as a single scalar `parsed_value` + a `solved` flag (see the current-state catalog). So timed values render as bare seconds (`593`, not `9:53`), guess/hint/mistake games all share one unlabeled "Best" column, failed Wordles leak the sentinel `7`, solved/failed is barely shown, and the entire "process" (grids, hints, backtracks, %-trails, under-par) is discarded at the storage layer. The overall board sidesteps units by counting per-day head-to-head wins, but is volume-sensitive and never shows values.

## Decisions locked during brainstorming

| Area | Decision |
|---|---|
| Primary view | **Per-game boards are the star**; the "overall" is a light medal tally, not a headline points number. |
| Ranking within a game (aggregate windows) | By **daily wins (medals)** over the window — same-day/same-puzzle comparisons aggregated. Raw "best time this week" is NOT a fair ranking metric (each day is a different-difficulty puzzle); PB is shown as a personal flourish only. |
| Daily view | The **live contest**: today's actual results ranked by the game's metric; today's best = 🥇. No-peek gated (hidden until the viewer has logged today). |
| Windows | **Today · This week · This month · All-time.** Today = raw contest; the rest = medal tallies. |
| Overall | A **medal tally** across games (golds rank; silver/bronze break ties), with a sub-line of which games each person leads + total played. Today's Overall = today's per-game winners. |
| "See the process" | **Today-only inline collapsible** in the leaderboard (NOT a separate screen). Aggregate-window rows stay **flat/non-expandable** ("best performance" expansion is parked for later). |
| Detail depth | **Hybrid:** capture structured per-game stats (guesses, mistakes, hints, backtracks, %-trail, time, difficulty, theme, under-par) AND keep the shared grid verbatim to render the process. |
| Board nav | Group switcher stays in the top bar; **one control row**: a **Game dropdown** (Overall + every game) + a **Window dropdown** (Today/Week/Month/All-time). No chip strip, no segment strip. |
| Played | Returns as **context**, not the ranking — per-game count on a game board, total on Overall; shown in the row's sub-line. |
| Home | A **snapshot**: today's progress + streak, then the top few of the overall medal tally (tap → full Overall on the Board screen). |

## Data model (the keystone)

Add a structured detail field to `entries` and keep the ranking scalar:

- **Keep** `parsed_value` (the ranking metric per game — seconds / guesses / mistakes / hints, all "lower is better") and `solved`. These continue to drive daily-win/medal computation unchanged in spirit.
- **Add** `detail JSONB` (nullable) on `entries` — a per-game structured object. Populated by parsers now; by auto-import later. Shape is per game (see per-game reference). Examples:
  - Wordle: `{ guesses: 3, solved: true, hardMode: true, grid: ["⬛🟨⬛⬛⬛","⬛🟩🟨⬛⬛","🟩🟩🟩🟩🟩"] }`
  - Connections: `{ mistakes: 2, solvedAll: true, grid: ["🟩🟦🟪🟪","🟦🟨🟨🟨","🟨🟨🟨🟨","🟩🟩🟩🟩","🟦🟦🟦🟦","🟪🟪🟪🟪"] }`
  - Strands: `{ hints: 0, theme: "Added flavor", grid: ["🔵🔵🔵🔵","🟡🔵🔵🔵","🔵🔵🔵🔵"] }`
  - Pinpoint: `{ guesses: 3, solved: true, trail: [33,3,100] }`
  - Minute Cryptic: `{ hints: 0, underPar: 3 }`
  - Zip: `{ seconds: 12, backtracks: 1 }`; Patches: `{ seconds: 19, hints: 0, redraws: 1 }`; Wend: `{ seconds: 45, hints: 0 }`; Crossclimb: `{ seconds: 88, fillOrder: [1,2,3] }`; plain timed (Queens/Tango/Mini Sudoku/Pips/India Mini/NYT Mini): `{ seconds: N }` (+ `difficulty` for Pips).
- **Keep** `raw_input` (the verbatim share text) — the source of the grid; `detail.grid` is derived from it so the client renders a structured grid without re-parsing raw text.
- **Backfill:** existing rows have `raw_input`; a one-time script re-parses stored `raw_input` into `detail` where possible (best-effort; rows that fail to re-parse keep `detail=null` and fall back to scalar display). No data loss.

Parsers gain a `detail` output alongside the existing `ParseResult` fields (the `Parser`/`ParseResult` interface extends with an optional `detail` object). The scalar `value` + `solved` stay the ranking inputs; `detail` is display/analytics only.

## Value formatting (new `formatValue` helper)

A single `formatResult(gameType, metric, value, solved, detail)` helper (new, e.g. `src/lib/formatResult.ts`) produces the board string per shape:
- **Timed** → `mm:ss` (add the inverse of `parseClock`; e.g. `593 → "9:53"`, `31 → "0:31"`).
- **Guesses (Wordle)** → `"3/6"` + `✓`; failed → `"X/6"` + `✗` (never the raw `7`).
- **Guesses (Pinpoint)** → `"3 guesses"`.
- **Mistakes (Connections)** → `"2 mistakes"`; `0` → `"Perfect"`; all-4-used → `"Failed"`.
- **Hints (Strands, Minute Cryptic)** → `"N hints"`; `0` → `"No hints"`.
Every board value carries a small unit label and (where relevant) a solved/failed marker. This is the "make the numbers proper" fix and is used everywhere a value renders (boards, Home, You, log confirmation).

## Scoring model

- **Daily win (per game, per day):** among entries for that game on that day that are `solved`, the best `parsed_value` by the game's `metric_direction` wins 🥇. Co-winners tied at best each get 🥇 (matches today's tally behavior). 2nd/3rd distinct values get 🥈/🥉 (for the medal tally + today's detail pills). This reuses the existing per-puzzle `tallyWins` logic, extended to also emit placements.
- **Aggregate board (Week/Month/All-time), per game:** rank by 🥇 count over the window (then 🥈, 🥉, then name). Show medals + played (this game, this window) + PB (personal best `parsed_value`, all-time, formatted).
- **Overall board:** rank by total 🥇 across all games over the window (then 🥈/🥉, then name); sub-line = games led + total played. Today's Overall = today's per-game winners.
- **Today board (per game):** the raw contest — rank solved entries by `parsed_value`/direction, unsolved/failed below, not-yet-played shown as pending; #1 = 🥇. No-peek: hidden until the viewer has logged that game today (existing behavior, unchanged).
- Streaks stay as-is (consecutive days played), shown on the You screen / per-game context.

## Surfaces

- **Board screen** (per group, via the top-bar group switcher): one control row — **Game ▾** (Overall + every game) and **Window ▾** (Today/Week/Month/All-time) — then the board.
  - *Today + a game:* live contest, rows expandable inline to today's detail (stat pills + grid).
  - *Week/Month/All + a game:* medal-tally board, rows flat (no expand).
  - *Overall (any window):* medal-tally standings across games.
- **Home:** today's progress + streak + a snapshot of the overall medal tally (tap → Overall).
- **You:** the viewer's own results in proper units (fix the raw-value display there too), streaks, recent list formatted via `formatResult`.

## Today-only collapsible detail

Tapping a row on a **Today** game board expands it in place to show:
- **Stat pills** in the game's units: solved/failed, the core metric (guesses/mistakes/hints/time), today's medal, and game-specific extras (hard mode, backtracks, redraws, under-par, difficulty).
- **The grid**, verbatim, where the game has one (Wordle/Connections/Strands — from `detail.grid`), with light treatment (Connections mistake rows dimmed; Strands theme shown). Timed games show pills only (no grid).
Aggregate-window rows and games without detail don't expand.

## Per-game reference (units + captured detail)

| Shape (rank rule) | Games | Row value | Captured `detail` / today's pills |
|---|---|---|---|
| **Timed** (fastest) | Queens, Tango, Mini Sudoku, India Mini, NYT Mini | `mm:ss` | seconds; completion |
| | Zip | `mm:ss` | seconds, **backtracks** |
| | Crossclimb | `mm:ss` | seconds, **fill order** |
| | Patches | `mm:ss` | seconds, **hints, redraws** |
| | Wend | `mm:ss` | seconds, **hints** |
| | Pips | `mm:ss` + difficulty tag | seconds, **difficulty** (Easy/Med/Hard ranked separately via `variant`) |
| **Guesses** (fewer) | Wordle | `n/6` + ✓ / `X/6` + ✗ | guesses, solved, hard mode, **grid** |
| | Pinpoint | `n guesses` | guesses, solved, **%-match trail** |
| **Mistakes** (fewer) | Connections | `N mistakes` / `Perfect` / `Failed` | mistakes, solved-all, **grid** (mistake rows dimmed) |
| **Hints** (fewer) | Strands | `No hints` / `N hints` | hints, **theme**, **grid** |
| | Minute Cryptic | `N hints` | hints, **N under community par** |

## Suggested phased rollout (for the plan)

Big change; split so each phase ships a working improvement:
- **Phase A — "proper numbers":** add `detail` column + extend parsers to populate it + backfill re-parse; add `formatResult`; render proper units + solved/failed everywhere values show (boards, Home, You). No scoring/nav change yet. Immediate clarity win, low risk.
- **Phase B — medals & nav:** daily-win → medals/placements + medal-tally aggregate boards + Overall as medal tally; the one-row Game/Window dropdown nav; played-as-context. Behavior change to the standings.
- **Phase C — process:** today-only inline collapsible with stat pills + grids.

## Out of scope

- Auto-import itself (separate future workstream; this model is its target).
- "Best performance" expansion on aggregate-window rows (parked).
- Any change to how entries are logged/parsed for *ranking* (the scalar metric per game is unchanged); only added structured detail.
- New games / parsers for currently-manual games.

## Testing strategy

- Pure: `formatResult` per shape (mm:ss incl. 0:0N and 9:53; Wordle solved/failed; Perfect/Failed; No hints); placement/medal computation incl. ties; aggregate medal tallies; PB selection.
- Parser tests: each parser emits the correct `detail` shape from its sample share text (extend existing `src/parsers/*.test.ts`).
- Component (jsdom): board renders proper units + medals; Today row expands to pills + grid; aggregate rows don't expand; Overall medal tally; Game/Window dropdowns; no-peek unchanged.
- Backfill: dry-run verifies re-parse coverage of existing `raw_input` and that failures fall back cleanly.
