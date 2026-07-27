# B005 — Schedule-aware streaks (Easy Down weekends) — Design Spec

**Status:** Approved (owner, 2026-07-27)
**Delivers:** tracker item **B005** [Medium] "Easy Down Streak — Easy Down only refreshes on weekdays."

## Problem

Easy Down (The Hindu "One Down") publishes only **Monday–Friday**; there is no Sat/Sun
puzzle. Bragboard's streak math treats two plays as consecutive only when their calendar day
numbers differ by exactly 1 (`src/scoring/streaks.ts`: `days[i] - days[i-1] === 1`), and
`currentStreak` additionally requires the latest play to be today or yesterday. So a player who
plays Friday and then Monday has a 3-day gap → the streak **breaks every weekend**, even though
they never missed a published puzzle. Verified live: Easy Down entries are logged only on
weekdays (e.g. Fri 07-24 → Mon 07-27), and today's logic snaps that streak.

(Note: Easy Down IS logging correctly — its time-based parser is unaffected. Only the streak
math is wrong. This is purely a streak/day-gap fix.)

## Decisions (owner-confirmed 2026-07-27)

- **Only Easy Down** is weekday-only (**Mon–Fri**). Every other game publishes every day and
  must keep its current streak behaviour exactly.
- Pure-logic fix, unit-tested, no schema migration.

## Design

A game has a **publishing schedule** (the set of weekdays it releases a puzzle). Streak
"consecutiveness" is measured in *scheduled* puzzle days, not raw calendar days, so
non-publishing days are skipped rather than counted as misses.

### Component 1 — schedule config: `src/scoring/schedule.ts` (new)

Pure data + lookup, depends on nothing:

```ts
// Weekdays as 0=Sun … 6=Sat.
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

// gameId -> the weekdays that game publishes a puzzle. Unlisted games publish daily.
const SCHEDULE: Record<string, number[]> = {
  "easy-down": WEEKDAYS,
};

export function publishDaysFor(gameId: string): number[] {
  return SCHEDULE[gameId] ?? [...ALL_DAYS];
}
```

### Component 2 — schedule-aware streak math: `src/scoring/streaks.ts` (modified)

Add pure weekday/publish-day helpers and an optional `publishDays` argument (default daily):

- `weekdayOf(dayNum)` = `((dayNum % 7) + 4) % 7` — epoch day 0 (1970-01-01) is a **Thursday**
  (=4), and puzzle day numbers are always ≥ 0, so `%` is non-negative. Returns 0=Sun … 6=Sat.
- `isPublishDay(dayNum, days)` = `days.includes(weekdayOf(dayNum))`.
- `nextPublishDay(dayNum, days)` = smallest `d > dayNum` with `isPublishDay(d, days)` (bounded
  loop, ≤ 7 iterations since `days` is non-empty).
- `prevPublishDay(dayNum, days)` = largest `d ≤ dayNum` with `isPublishDay(d, days)` (≤ 7).

**Typing (avoids TS2322):** the new params are typed `readonly number[]` and default to
`ALL_DAYS`. `ALL_DAYS` is `as const` (a `readonly` tuple), which is assignable to
`readonly number[]` but NOT to `number[]` — so the params must be `readonly number[]`
(and `publishDaysFor` returning a mutable `number[]` is still assignable to that). Do not type
the params as `number[]` with an `as const` default.

The `nextPublishDay`/`prevPublishDay` helpers assume a non-empty `publishDays` (their bounded
loop relies on at least one publishing weekday). This holds for every caller because
`publishDaysFor` never returns `[]`; the helpers may include a defensive comment but need no
runtime guard.

Rewrite the two exports with a default `publishDays: readonly number[] = ALL_DAYS`:

- **`longestStreak(datesPlayed, publishDays = ALL_DAYS)`** — over the sorted-unique day numbers,
  two adjacent plays `days[i-1], days[i]` are consecutive iff
  `nextPublishDay(days[i-1], publishDays) === days[i]` (no scheduled puzzle was skipped between
  them). Track the longest run.
- **`currentStreak(datesPlayed, today, publishDays = ALL_DAYS)`**:
  - `recent = prevPublishDay(toDayNumber(today), publishDays)` — the most recent *published*
    puzzle on/before today.
  - `latest = ` the largest played day number.
  - The streak is "current" iff `latest === recent` (played the latest puzzle) **or**
    `latest === prevPublishDay(recent - 1, publishDays)` (played the previous puzzle, latest not
    done yet — a one-puzzle grace mirroring today-or-yesterday). Otherwise return 0.
  - If current, count back using the same consecutive rule
    (`nextPublishDay(days[i-1], publishDays) === days[i]`).

**Backward-compatibility (the key guarantee):** with the default `publishDays = [0..6]`,
`nextPublishDay(d) === d + 1`, `prevPublishDay(d) === d`, `recent === toDayNumber(today)`, and the
grace day is `today - 1`. So the new code reduces *exactly* to the current logic for every
daily game — no behaviour change, and every existing streak test passes unmodified.

### Component 3 — wiring: `src/scoring/gameBoard.ts` + `src/scoring/me.ts` (modified)

- `computeGameBoard(entries, today, start, publishDays = ALL_DAYS)` — add the trailing optional
  param; forward it to `currentStreak(allDates, today, publishDays)` and
  `longestStreak(allDates, publishDays)`. Existing callers/tests that omit it get daily.
- `src/scoring/me.ts:83` — pass the schedule for the game being processed:
  `computeGameBoard(datedEntries, today, null, publishDaysFor(g.id))` (import `publishDaysFor`
  from `@/scoring/schedule`; `g.id` is in scope in that per-game loop).

`computeGameBoard` is called only from `me.ts` (streaks surface via `me.streaks` → Home/You/
StreakBadge). No other consumer.

## Constraints / not changed

- **No schema migration** (schedule lives in code).
- **Ranking/medals untouched** — this touches only streak counts.
- **All non-Easy-Down games unchanged** (default daily schedule = current behaviour).
- **Timezone/DST is not a concern:** day numbers come from `toDayNumber` applied to
  `YYYY-MM-DD` *date strings* (`puzzleDate`, and `today` already localised via
  `localDateInTz("Asia/Kolkata")`). No wall-clock instant is used, so `weekdayOf` returns the
  true civil weekday regardless of runtime TZ/DST.
- **Off-schedule stray entries** (e.g. a Saturday Easy Down row, which shouldn't occur since
  there's no weekend puzzle) don't crash — the helpers accept any day number. Such a play may
  not extend a run, and in the specific case where the stray day *is* today it can leave
  `currentStreak` at 0 (because `latest > recent`). This is an accepted edge; real Easy Down
  entries fall on Mon–Fri, so it does not arise in practice. Not special-cased.

## Testing

- **`src/scoring/streaks.test.ts`** — keep all existing daily tests (they must pass unchanged,
  proving backward-compat). Add Easy Down (`[1,2,3,4,5]`) cases:
  - Fri → Mon (across a weekend) counts as consecutive: streak continues.
  - A missed weekday (e.g. played Mon, Wed but not Tue) breaks the streak.
  - `currentStreak` stays alive on Sat/Sun when the player played the most recent Friday
    (today = Sat or Sun, latest = Fri → current).
  - `currentStreak` is 0 when the player missed the latest published weekday beyond the grace.
  - `weekdayOf` returns the correct weekday for a couple of known dates.
- **`src/scoring/schedule.test.ts`** (new) — `publishDaysFor("easy-down") = [1,2,3,4,5]`;
  `publishDaysFor("wordle")` / unknown = `[0..6]`.
- **`src/scoring/gameBoard.test.ts`** — existing tests unchanged (default daily); add one case
  passing an Easy-Down schedule to confirm the param threads through to the streak result.

## Rollout

Code-only, no DB change. Standard gated PR → CI `verify` → owner merge → prod health check.
Effect is immediate and visible (Easy Down streaks stop breaking on weekends); no dependency on
any other work.
