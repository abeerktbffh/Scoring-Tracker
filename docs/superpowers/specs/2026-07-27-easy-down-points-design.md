# Easy Down: time → points (B007 twin) — Design Spec

**Status:** Approved (owner, 2026-07-27)
**Delivers:** Easy Down auto-log fix — the same regression as B007, now hitting the second
Hindu crossword. (Tracked as **B008**.)

## Problem

The Hindu changed Easy Down (One Down)'s share format from a TIME to a POINTS score, exactly
as it did for Hindu Mini (B007). Bragboard's Easy Down parser is broken on two counts:

1. **Detection.** `src/parsers/easyDown.ts` matches `thehindu.com/crosswords/hindu-one-down`.
   The new share links to `https://www.thehindu.com/?id=<id>&set=hindu-one-down&puzzleType=crossword`
   — no `/crosswords/` path — so it isn't recognised as Easy Down.
2. **Value.** The parser extracts a **time** via `parseDurationSeconds`; the new share carries a
   **score** ("I scored 69 on this Crossword."), so there's no time to extract.

Verified: every logged Easy Down entry through 2026-07-27 is an old-style time value
(148/247/302… seconds); new-format shares now fail to log. New share sample:
`I scored 69 on this Crossword. Think you can do better? https://www.thehindu.com/?id=sdfoioe&set=hindu-one-down&puzzleType=crossword`

The metric changed: Easy Down was a **timed** game (`lower_better`, seconds). It is now
**points, higher is better** (owner-confirmed).

## Decisions (owner-confirmed 2026-07-27)

- Points, **higher-is-better**.
- **Keep** existing time-based Easy Down entries (no deletion).
- Board display: **`N pts`** (reusing the `"points"` shape shipped in B007).

### Consequence of keep-old-entries + direction flip (owner-acknowledged)

Flipping `metric_direction` to `higher_better` is **retroactive**, so it re-ranks the old
time-based days too. Old entries store `value` = seconds (lower was better), so under
higher-better the **slowest** old time now "wins" that day. Data check (2026-07-27): Easy Down
has **9 historical puzzle-days, of which exactly 2 had 2+ players** — **2026-07-13** and
**2026-07-16** (2 players each). Only those two days' medal/win assignments invert; every other
historical day is single-player (rank is direction-independent) and unaffected. This propagates
into all-time medal/win aggregates for those two days only. Accepted as part of keep-old-entries;
the two days can be cleared later if it ever matters.

## Design (mirrors B007, scoped to `easy-down`)

### 1. Parser — `src/parsers/easyDown.ts` (rewrite)

- Detection marker → `/set=hindu-one-down/i` (the reliable identifier in the new URL; distinct
  from Hindu Mini's `set=thehindu-mini-crossword`, so no registry collision).
- Value → `/scored\s+([\d,]+)/i`, strip commas, `parseInt` (comma-safe).
- Return `{ gameId: "easy-down", puzzleNumber: null, variant: null, value: <score>,
  solved: true, detail: { points: <score> }, puzzleDate: null }`.
- If the marker matches but no score is found, throw (nothing bogus logs). Old-format time
  links no longer match — that era is retired.
- Parser stays registered in `src/parsers/registry.ts` (unchanged). Registry order is
  hinduMini → easyDown; an Easy Down URL fails hinduMini's `set=thehindu-mini-crossword` marker
  and matches easyDown's `set=hindu-one-down`. No collision.

### 2. Display — `src/lib/formatResult.ts`

- Change `RESULT_SHAPE["easy-down"]` from `"timed"` to `"points"`.
- **No other display change needed:** the `"points"` shape (`formatResult` case →
  `` `${value} pts` ``) and the `StatPills` `"points"` case (`` `${d.points ?? row.value} pts` ``)
  were both added in B007. Easy Down inherits them automatically. Old time entries (no
  `detail.points`) fall back to `row.value` and render their seconds as `N pts` — the accepted
  keep-old-entries trade-off.

### 3. Scoring direction — prod `games` row (gated DB change)

- `UPDATE games SET metric_direction='higher_better' WHERE id='easy-down';` (was `lower_better`).
- Update the seed source: `scripts/add-hindu-games.mjs:10` — the row
  `["easy-down", "Easy Down", "timed", "lower_better", "easy-down", false]` → change
  `"lower_better"` to `"higher_better"`. (That script's `ON CONFLICT DO NOTHING` means
  re-running won't touch the prod row — the manual `UPDATE` is what flips prod.)
- No scoring-code change: `isBetter`/`medals`/streaks read `metric_direction` from the row.
- The `games.type` column stays `"timed"` — it drives neither display (RESULT_SHAPE keys off
  gameId) nor ranking (keys off metric_direction); it's admin/API metadata only. Left as-is,
  consistent with B007's hindu-mini row. Only the `metric_direction` field changes.

### Not changed / reused

- `src/parsers/types.ts` (`ResultDetail.points`) — already added in B007.
- `src/components/StatPills.tsx` — `"points"` case already exists; no change.
- `ResultShape "points"` — already exists.
- **Streaks:** B005 already made Easy Down (`easy-down` → Mon–Fri) schedule-aware; once logging
  resumes, weekend-safe streaks accrue automatically. No streak change here.
- **Hindu Mini** — untouched (already fixed in B007).
- **Accepted unknown:** parser always returns `solved: true` (no failed-share sample), same as
  B007.
- **`gameLinks.ts` play-icon URL (out of scope, flagged):** `src/lib/gameLinks.ts:18` still maps
  easy-down's F002 "play" icon to the old `thehindu.com/crosswords/hindu-one-down/` path, which
  may 404 now. Not part of the detection/logging fix; consistent with B007 leaving hindu-mini's
  old path. Note for a possible owner check, not blocking.

## Testing

- **`src/parsers/easyDown.test.ts`** — rewrite for the new format: detects the new URL
  (`…?id=…&set=hindu-one-down&puzzleType=crossword`); parses the sample "I scored 69 …" →
  `value: 69, solved: true, detail: { points: 69 }`; a marked string with no score → throws;
  the OLD time-format link (`/crosswords/hindu-one-down`, "in 3 minutes…") is no longer detected;
  a comma case ("scored 1,234" → 1234).
- **`src/lib/formatResult.ts` test** — `shapeForGame("easy-down") === "points"`; `formatResult`
  is already covered by the B007 points case, but add `formatResult("easy-down", 69, true) ===
  "69 pts"` for explicitness.
- **`src/parsers/registry.test.ts`** — add a routing case: the Easy Down sample routes to
  `easy-down` (guards against collision with Hindu Mini / India Mini).

## Rollout (gated)

Code + one prod row `UPDATE`, single gated window (identical shape to B007):

1. Backup tag on `origin/main` + Neon restore point.
2. Ship code (parser + `formatResult` remap + seed line + tests) → PR → CI `verify` → owner merge.
3. Read-only pre-flight (show the current `easy-down` row = `lower_better`), then
   `UPDATE games SET metric_direction='higher_better' WHERE id='easy-down'` immediately after
   merge, with owner go-ahead; confirm 1 row + re-read.
4. Verify: log the owner's "I scored 69" sample → logs, shows `69 pts`, ranks higher-better.
