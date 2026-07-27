# B007 — Hindu Mini: time → points — Design Spec

**Status:** Approved (owner, 2026-07-27)
**Delivers:** tracker item **B007** [Critical] "Hindu Mini logging issue — doesn't log anymore (time changed to score)."

## Problem

The Hindu changed the Hindu Mini crossword's share format, which broke Bragboard's auto-log on two counts:

1. **Detection.** `src/parsers/hinduMini.ts` recognises a result by the URL
   `thehindu.com/crosswords/thehindu-mini-crossword`. The new share links to
   `https://www.thehindu.com/?id=<id>&set=thehindu-mini-crossword&puzzleType=crossword`
   — no `/crosswords/` path — so the marker never matches and the text isn't recognised as
   Hindu Mini at all.
2. **Value.** Even when detected, the parser extracts a **time** via `parseDurationSeconds`.
   The new share carries a **score**, e.g. *"I scored 141 on this Crossword."* — there is no
   time to extract.

The metric itself changed: Hindu Mini was a **timed** game (`lower_better`, seconds, shown as
`m:ss`). It is now a **points** game where **higher is better** (owner-confirmed: 141 = points,
bigger is better).

## Decisions (owner-confirmed 2026-07-27)

- New format is **points, higher-is-better**.
- **Keep** the existing time-based entries (do not delete data).
- Board display: **`141 pts`**.
- **Scope: Hindu Mini only.** Easy Down (`src/parsers/easyDown.ts`) is almost certainly broken
  the same way (same old-style URL marker) but is **deferred** pending an Easy Down share
  sample — out of scope for this fix.

## Design

### 1. Parser — `src/parsers/hinduMini.ts`

- **Detection marker →** the query param `set=thehindu-mini-crossword`, i.e.
  `/set=thehindu-mini-crossword/i`. This is the reliable identifier in the new URL and does not
  collide with Easy Down's `set=hindu-one-down`.
- **Value extraction →** `/scored\s+(\d+)/i`, capturing the integer score (e.g. `141`).
- Return `{ gameId: "hindu-mini", puzzleNumber: null, variant: null, value: <score>,
  solved: true, detail: { points: <score> }, puzzleDate: null }`.
- If the marker matches but no score is found, throw (as today) so nothing bogus logs. The
  old time-format links no longer match the marker and simply won't parse — acceptable; that
  format is retired.
- The parser stays registered in `src/parsers/registry.ts` unchanged (only its internals
  change). `detectAndParse` dispatch is unaffected.

### 2. Result detail type — `src/parsers/types.ts`

- Add `points?: number;` to `ResultDetail` (alongside `seconds?`), for the Hindu Mini score.
  One-line, backward-compatible addition.

### 3. Display — `src/lib/formatResult.ts`

- Add a new `ResultShape` value `"points"`.
- Change `RESULT_SHAPE["hindu-mini"]` from `"timed"` to `"points"`.
- The `"points"` case renders `` `${value} pts` `` (e.g. `141 pts`).
- Consequence (accepted): existing time-based Hindu Mini entries store `value` = seconds, so
  they will now render as e.g. `171 pts`. This is the known keep-old-entries trade-off.

### 4. Scoring direction — prod `games` row (gated DB change)

- The ranking direction lives in the `games` table (`metric_direction`), seeded `lower_better`
  for hindu-mini. Change it to `higher_better`:
  `UPDATE games SET metric_direction='higher_better' WHERE id='hindu-mini';`
- Update the local seed source so a re-seed matches (the hindu-mini row that
  `scripts/bug-automation/add-hindu-games.mjs` / seed defines).
- The scoring functions (`isBetter`, `computeDailyContest`, `medals.ts`) already take
  `metric_direction` as input, so no scoring-code change is needed — flipping the row makes new
  points rank correctly.
- The `games.type` column (currently `"timed"` for hindu-mini) is display/category metadata,
  not a scoring input; the plan will confirm nothing branches on it for ranking/format, and
  leave it unless it drives behaviour. `metric_direction` is the functional change.

### Kept as-is / not changed

- **Old entries:** untouched (owner decision). All-time board will show those old time-days
  with inverted winners and their raw seconds rendered as `pts` — documented, acceptable for a
  young game; can be cleaned later.
- **Easy Down:** untouched, deferred pending a sample.
- **Puzzle-date handling, no-peek, entry storage:** unchanged.

## Testing

- **`src/parsers/hinduMini.test.ts`** — rewrite for the new format:
  - Detects the new URL (`…?id=…&set=thehindu-mini-crossword&puzzleType=crossword`).
  - Parses the exact sample *"I scored 141 on this Crossword. Think you can do better? <url>"*
    → `value: 141, solved: true, detail: { points: 141 }`.
  - A Hindu-Mini-marked string with no score → not logged (parse throws / `detectAndParse`
    returns null).
  - An old time-format string (`/crosswords/thehindu-mini-crossword`, "in 2 minutes 51 seconds")
    is no longer detected as Hindu Mini.
- **`src/lib/formatResult.ts` test** — hindu-mini `value: 141` → `"141 pts"`.
- **Registry** — a full `detectAndParse` on the sample routes to hindu-mini (guards against a
  marker collision with Easy Down / India Mini).

## Rollout (gated)

Code + a one-row prod DB change. Sequence in a single gated window:

1. Ship code (parser + `types.ts` + `formatResult` + seed source + tests) via PR → CI `verify`
   → owner merge.
2. **Immediately** run the prod `UPDATE games SET metric_direction='higher_better' WHERE
   id='hindu-mini'` — preceded by a read-only pre-flight (show the current row) and a noted
   Neon restore point, with owner go-ahead. Doing it right after merge ensures new points rank
   higher-better the moment the parser is live (avoid a window where points are ranked
   lower-better).
3. Verify on prod by logging the owner's `141` sample (parses, logs, shows `141 pts`, ranks
   higher-better).

Backup: pre-deploy tag on `origin/main`; Neon PITR timestamp before the `UPDATE`.
