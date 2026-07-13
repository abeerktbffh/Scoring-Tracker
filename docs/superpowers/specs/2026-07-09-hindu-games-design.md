# Hindu Mini + Easy Down — Design Spec

**Status:** Approved (owner, 2026-07-09)
**Adds:** two new parser-backed timed crossword games to Bragboard's global catalog.

## Goal

Let players log two Hindu (thehindu.com) crosswords by pasting/sharing their result, exactly like the existing India Mini game.

| Display name | Game id | Share link marker | Metric |
|---|---|---|---|
| Hindu Mini | `hindu-mini` | `thehindu.com/crosswords/thehindu-mini-crossword` | timed, lower_better |
| Easy Down | `easy-down` | `thehindu.com/crosswords/hindu-one-down` | timed, lower_better |

Sample share texts (the **entire** clipboard — no date or number present):
- Hindu Mini: `I just solved The Hindu Mini in 2 minutes and 51 seconds. Test your wits at [https://www.thehindu.com/crosswords/thehindu-mini-crossword]`
- Easy Down: `I just solved this Crossword in 3 minutes and 7 seconds. Can you beat my time? [https://www.thehindu.com/crosswords/hindu-one-down]`

## Design

Mechanically identical to `india-mini`: a timed crossword, always `solved: true`, `value` = total seconds, `variant: null`, `detail: { seconds }`.

### 1. Detection (no collision)
Each parser's `detect()` matches ONLY its own `thehindu.com` path segment:
- Hindu Mini: `/thehindu\.com\/crosswords\/thehindu-mini-crossword/i`
- Easy Down: `/thehindu\.com\/crosswords\/hindu-one-down/i`

Easy Down's sentence ("I just solved this Crossword…") is worded like India Mini, but India Mini is detected solely by its `indiamini.in` link, so the three never collide. A registry routing test asserts each of the three sample texts resolves to the correct `gameId` (and India Mini's sample does NOT resolve to Easy Down, nor vice-versa).

### 2. Shared time helper (targeted DRY cleanup)
The min/sec extraction is currently inline in `india-mini`. Extract it to a pure helper `parseDurationSeconds(text: string): number | null` (new `src/parsers/duration.ts`) handling `"X minutes and Y seconds"`, `"X minutes"` (+ optional trailing seconds), and `"Y seconds"` — returns total seconds or `null`. India Mini is refactored to use it (behavior unchanged, its existing tests still pass); the two new parsers use it too. Date extraction stays in India Mini (the new games have none).

### 3. Parse contract
Both new parsers set `puzzleNumber: null` and `puzzleDate: null` (no identifier in the share text). Downstream, `resolvePuzzleDate` therefore returns `source: "fallback"` → the entry is filed on the **log day** (`localDateInTz(PLATFORM_TZ)`). No `[epoch-missing]` warning fires because `puzzleNumber` is null (the warn is only for *numbered* games lacking an epoch).

### 4. Catalog + display
- Two rows added to the global `games` table (no `group_id` — the catalog is global post-multigroup): `('hindu-mini','Hindu Mini','timed','lower_better','hindu-mini',false, active=true)` and `('easy-down','Easy Down','timed','lower_better','easy-down',false, active=true)`.
- `RESULT_SHAPE` (`src/lib/formatResult.ts`) gains explicit `"hindu-mini": "timed"` and `"easy-down": "timed"` (default is already `timed`, but explicit for clarity/consistency).
- Both appear on the **Global** board automatically (global board = all active games). Private groups opt in via the existing per-group games management — no special handling.

### 5. Known limitation (accepted, owner-confirmed)
No number/date in the share text ⇒ log-day dating (identical to manual entries). Correct for same-day logging; a cross-midnight catch-up log could mis-file — accepted tradeoff for a casual daily group. If The Hindu ever adds a date/number to the share text, a one-line extraction (like India Mini's) would fix it.

## Testing
- `hinduMini.test.ts` / `easyDown.test.ts`: detect their own sample; reject the other two games' samples and plain text; parse `2m51s→171` / `3m7s→187`; `solved:true`, `puzzleNumber:null`, `puzzleDate:null`, `detail:{seconds}`.
- `duration.test.ts`: min+sec, min-only, sec-only, singular ("1 minute and 1 second"→61), no-time→null.
- India Mini's existing tests remain green after the refactor (regression guard).
- Registry routing test: the three sample texts (india-mini, hindu-mini, easy-down) each `detectAndParse` to the correct `gameId`.

## Deploy (gated — owner go-ahead; no schema migration)
1. Backup tag on `main` + Neon PITR point.
2. Merge the code → prod auto-deploys.
3. Insert the two catalog rows on prod via a tiny idempotent script (`INSERT … ON CONFLICT (id) DO NOTHING`) — additive, reversible.
Nothing to prod without explicit go-ahead.

## Out of scope
- Adding these games to any specific private group (group admins do that in-app).
- Reworking the stale `scripts/seed.mjs` (references the dropped `g1`/`group_id`; untouched here).
- Any icon art for the new games (`icon` left null, like the other games).
