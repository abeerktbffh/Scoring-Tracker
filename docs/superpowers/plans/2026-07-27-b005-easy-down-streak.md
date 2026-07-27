# B005 — Schedule-aware streaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Easy Down's streak (Mon–Fri game) survive weekends by measuring streak consecutiveness in *scheduled* puzzle days, while leaving every daily game's streaks bit-for-bit unchanged.

**Architecture:** A new `schedule.ts` maps a gameId to the weekdays it publishes (only `easy-down` is non-daily). `streaks.ts` gains pure weekday/publish-day helpers and an optional `publishDays` argument; "consecutive" becomes "next scheduled publishing day." The default schedule (all 7 days) reduces the new math exactly to the current logic. `computeGameBoard` forwards `publishDays`, and `me.ts` (its only caller) passes `publishDaysFor(g.id)`.

**Tech Stack:** TypeScript, Vitest, Next.js 14.2 (pure scoring logic — no DB, no React).

## Global Constraints

- **No schema migration** (schedule lives in code).
- **Ranking/medals untouched** — this changes only streak counts.
- **All non-Easy-Down games bit-for-bit unchanged** — default `publishDays = ALL_DAYS` must reduce exactly to the current logic; existing `streaks.test.ts` / `gameBoard.test.ts` / `me.test.ts` pass unmodified.
- **Typing:** the `publishDays` params MUST be `readonly number[]` (default `ALL_DAYS`, an `as const` tuple; a `number[]` param would be TS2322).
- Day numbers are non-negative (dates ≥ 1970), so `weekdayOf`'s `%` is non-negative. Helpers assume a non-empty `publishDays` (guaranteed by `publishDaysFor`).
- `computeGameBoard`'s only non-test caller is `src/scoring/me.ts`.

---

## Task 1: Schedule-aware streaks (schedule config + streak math + wiring)

**Files:**
- Create: `src/scoring/schedule.ts`
- Test: `src/scoring/schedule.test.ts`
- Modify: `src/scoring/streaks.ts`
- Test: `src/scoring/streaks.test.ts` (keep existing, add Easy Down cases)
- Modify: `src/scoring/gameBoard.ts:15-19,44-45`
- Test: `src/scoring/gameBoard.test.ts` (keep existing, add one case)
- Modify: `src/scoring/me.ts:83` (+ import)

**Interfaces:**
- Produces: `publishDaysFor(gameId: string): number[]`; `ALL_DAYS` (`readonly [0,1,2,3,4,5,6]`); `weekdayOf(dayNum: number): number` (0=Sun…6=Sat); `currentStreak(datesPlayed: string[], today: string, publishDays?: readonly number[])`; `longestStreak(datesPlayed: string[], publishDays?: readonly number[])`; `computeGameBoard(entries, today, start, publishDays?: readonly number[])`.

- [ ] **Step 1: Write the schedule config test (RED).**

Create `src/scoring/schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { publishDaysFor, ALL_DAYS } from "./schedule";

describe("publishDaysFor", () => {
  it("returns Mon–Fri for easy-down", () => {
    expect(publishDaysFor("easy-down")).toEqual([1, 2, 3, 4, 5]);
  });
  it("returns all 7 days for a daily game and for unknown ids", () => {
    expect(publishDaysFor("wordle")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(publishDaysFor("totally-unknown")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("ALL_DAYS is the 7-day week", () => {
    expect([...ALL_DAYS]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

Run: `npx vitest run src/scoring/schedule.test.ts`
Expected: FAIL — `./schedule` does not exist yet.

- [ ] **Step 3: Create the schedule config.**

Create `src/scoring/schedule.ts`:

```ts
// Which weekdays each game publishes a puzzle. 0 = Sunday … 6 = Saturday.
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

// gameId -> the weekdays that game publishes. Unlisted games publish daily.
const SCHEDULE: Record<string, number[]> = {
  "easy-down": WEEKDAYS,
};

export function publishDaysFor(gameId: string): number[] {
  return SCHEDULE[gameId] ?? [...ALL_DAYS];
}
```

- [ ] **Step 4: Run → PASS.**

Run: `npx vitest run src/scoring/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Add Easy Down cases to the streak test (RED).**

Edit `src/scoring/streaks.test.ts`. Change the import line to also pull `weekdayOf` and `toDayNumber`:

```ts
import { currentStreak, longestStreak, weekdayOf } from "./streaks";
import { toDayNumber } from "@/lib/day";
```

Keep every existing `describe` block unchanged. Append these new blocks at the end of the file:

```ts
describe("weekdayOf", () => {
  it("maps real dates to weekdays (0=Sun … 6=Sat)", () => {
    expect(weekdayOf(toDayNumber("2026-07-24"))).toBe(5); // Friday
    expect(weekdayOf(toDayNumber("2026-07-27"))).toBe(1); // Monday
    expect(weekdayOf(toDayNumber("2026-07-26"))).toBe(0); // Sunday
  });
});

describe("schedule-aware streaks (Easy Down, Mon–Fri = [1,2,3,4,5])", () => {
  const MF = [1, 2, 3, 4, 5];

  it("counts Fri→Mon across a weekend as consecutive", () => {
    // Thu 07-23, Fri 07-24, Mon 07-27; today = Mon 07-27
    expect(currentStreak(["2026-07-23", "2026-07-24", "2026-07-27"], "2026-07-27", MF)).toBe(3);
    expect(longestStreak(["2026-07-23", "2026-07-24", "2026-07-27"], MF)).toBe(3);
  });

  it("still breaks on a genuinely missed weekday", () => {
    // Mon 07-20, Wed 07-22 (Tue 07-21 missed); today = Wed 07-22 → only today counts
    expect(currentStreak(["2026-07-20", "2026-07-22"], "2026-07-22", MF)).toBe(1);
    expect(longestStreak(["2026-07-20", "2026-07-22"], MF)).toBe(1);
  });

  it("keeps the streak alive on Sat/Sun after the latest Friday", () => {
    expect(currentStreak(["2026-07-23", "2026-07-24"], "2026-07-25", MF)).toBe(2); // Sat
    expect(currentStreak(["2026-07-23", "2026-07-24"], "2026-07-26", MF)).toBe(2); // Sun
  });

  it("is 0 once the latest published weekday is missed beyond the one-puzzle grace", () => {
    // Latest play Fri 07-24; today = Tue 07-28 (Mon 07-27 was missed)
    expect(currentStreak(["2026-07-23", "2026-07-24"], "2026-07-28", MF)).toBe(0);
  });
});
```

- [ ] **Step 6: Run → FAIL.**

Run: `npx vitest run src/scoring/streaks.test.ts`
Expected: FAIL — `weekdayOf` is not exported yet, and `currentStreak`/`longestStreak` don't accept a third `publishDays` argument, so the Easy Down expectations (e.g. Fri→Mon = 3) fail.

- [ ] **Step 7: Rewrite the streak math.**

Replace the entire contents of `src/scoring/streaks.ts` with:

```ts
import { toDayNumber } from "@/lib/day";
import { ALL_DAYS } from "./schedule";

function sortedUniqueDayNumbers(datesPlayed: string[]): number[] {
  return [...new Set(datesPlayed.map(toDayNumber))].sort((a, b) => a - b);
}

// 0 = Sunday … 6 = Saturday. Epoch day 0 (1970-01-01) is a Thursday (=4).
// Puzzle day numbers are always >= 0, so the modulo stays non-negative.
export function weekdayOf(dayNum: number): number {
  return ((dayNum % 7) + 4) % 7;
}

function isPublishDay(dayNum: number, days: readonly number[]): boolean {
  return days.includes(weekdayOf(dayNum));
}

// Smallest day number strictly greater than `dayNum` that publishes.
// Bounded: any run of 7 consecutive days contains every weekday, and
// `days` is non-empty (guaranteed by publishDaysFor), so this terminates.
function nextPublishDay(dayNum: number, days: readonly number[]): number {
  let d = dayNum + 1;
  while (!isPublishDay(d, days)) d++;
  return d;
}

// Largest day number <= `dayNum` that publishes.
function prevPublishDay(dayNum: number, days: readonly number[]): number {
  let d = dayNum;
  while (!isPublishDay(d, days)) d--;
  return d;
}

export function currentStreak(
  datesPlayed: string[],
  today: string,
  publishDays: readonly number[] = ALL_DAYS,
): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  const recent = prevPublishDay(toDayNumber(today), publishDays);
  const latest = days[days.length - 1];
  // Current only if the latest play is the most recent published puzzle, or
  // the one before it (a one-puzzle grace, mirroring today-or-yesterday).
  if (latest !== recent && latest !== prevPublishDay(recent - 1, publishDays)) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (nextPublishDay(days[i - 1], publishDays) === days[i]) streak++;
    else break;
  }
  return streak;
}

export function longestStreak(
  datesPlayed: string[],
  publishDays: readonly number[] = ALL_DAYS,
): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (nextPublishDay(days[i - 1], publishDays) === days[i]) run++;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}
```

- [ ] **Step 8: Run → PASS (old + new).**

Run: `npx vitest run src/scoring/streaks.test.ts`
Expected: PASS — all existing daily-streak tests AND the new Easy Down / weekdayOf tests pass (backward-compat holds because the default all-7 schedule makes `nextPublishDay(d)===d+1` and `prevPublishDay(d)===d`).

- [ ] **Step 9: Add the gameBoard threading test (RED).**

Edit `src/scoring/gameBoard.test.ts`. Keep every existing test. Inside the `describe("computeGameBoard", …)` block, add:

```ts
  it("threads a weekday-only schedule so Fri→Mon stays consecutive", () => {
    const entries: DatedGameEntry[] = [
      e("a", "2026-07-24", 4), // Fri
      e("a", "2026-07-27", 3), // Mon
    ];
    const r = computeGameBoard(entries, "2026-07-27", null, [1, 2, 3, 4, 5]);
    expect(r[0].currentStreak).toBe(2);
    expect(r[0].longestStreak).toBe(2);
  });
```

(The `e()` helper already exists at the top of the file and builds a `DatedGameEntry`; the entry's gameId is irrelevant here because the schedule is passed explicitly.)

- [ ] **Step 10: Run → FAIL.**

Run: `npx vitest run src/scoring/gameBoard.test.ts`
Expected: FAIL — `computeGameBoard` takes only 3 args today, so the 4th argument is a type error / ignored and Fri→Mon computes as a broken streak (currentStreak 1, not 2).

- [ ] **Step 11: Thread `publishDays` through `computeGameBoard`.**

In `src/scoring/gameBoard.ts`:

1. Add the import at the top (after the existing imports):
```ts
import { ALL_DAYS } from "./schedule";
```
2. Change the signature (lines ~15-19) to add the trailing param:
```ts
export function computeGameBoard(
  entries: DatedGameEntry[],
  today: string,
  start: string | null,
  publishDays: readonly number[] = ALL_DAYS,
): GameBoardStat[] {
```
3. Change the two streak calls (lines ~44-45) to forward it:
```ts
      currentStreak: currentStreak(allDates, today, publishDays),
      longestStreak: longestStreak(allDates, publishDays),
```

- [ ] **Step 12: Run → PASS.**

Run: `npx vitest run src/scoring/gameBoard.test.ts`
Expected: PASS — existing daily cases unchanged; the new weekday-schedule case gives streak 2.

- [ ] **Step 13: Wire the schedule in `me.ts`.**

In `src/scoring/me.ts`:

1. Add the import (with the other `@/scoring` imports near the top):
```ts
import { publishDaysFor } from "@/scoring/schedule";
```
2. Change the `computeGameBoard` call (line ~83, inside the `games.map((g) => …)` loop where `g.id` is in scope) to:
```ts
    const board = computeGameBoard(datedEntries, today, null, publishDaysFor(g.id));
```

- [ ] **Step 14: Typecheck, full suite, build.**

Run: `npx tsc --noEmit`
Expected: 0 errors (confirms the `readonly number[]` typing is correct end-to-end).

Run: `npx vitest run`
Expected: all tests pass — existing streak/gameBoard/me tests unchanged, new tests green.

Run: `npm run build`
Expected: build completes.

- [ ] **Step 15: Commit.**

```bash
git add src/scoring/schedule.ts src/scoring/schedule.test.ts \
        src/scoring/streaks.ts src/scoring/streaks.test.ts \
        src/scoring/gameBoard.ts src/scoring/gameBoard.test.ts \
        src/scoring/me.ts
git commit -m "fix(streaks): schedule-aware streaks so Easy Down survives weekends (B005)"
```

---

## Deploy (gated — owner go-ahead)

Code-only, no DB change. Standard gated sequence: backup tag on `origin/main` → PR → CI `verify` → **owner approves** → squash-merge → prod health check (home 200, `/api/me` 401 signed-out, `/you` 200). Effect is immediate — Easy Down streaks stop breaking on weekends.

## Self-Review

- **Spec coverage:**
  - Schedule config (`easy-down` Mon–Fri, others daily) → Step 3 + Step 1 test. ✓
  - `weekdayOf` + `next/prevPublishDay` + schedule-aware `current/longestStreak` with `readonly number[]` default → Step 7 (params typed `readonly number[] = ALL_DAYS`). ✓
  - Grace = one puzzle (`latest === recent || latest === prevPublishDay(recent-1)`) → Step 7 currentStreak; tested Sat/Sun-alive + Tue-dead → Step 5. ✓
  - Backward-compat (default all-7 = current logic) → existing tests kept unchanged (Steps 5/9 keep them), asserted green in Step 8/12/14. ✓
  - Wiring `computeGameBoard` param + `me.ts` `publishDaysFor(g.id)` → Steps 11/13. ✓
  - No schema/DB, ranking untouched → nothing in the diff touches SQL, medals, or `value`. ✓
- **Placeholder scan:** none — every code step shows complete code; commands have expected output.
- **Type consistency:** `ALL_DAYS` (`readonly [0..6]`) is assignable to the `readonly number[]` params/defaults in `streaks.ts` and `gameBoard.ts`; `publishDaysFor` returns `number[]` (assignable to `readonly number[]`); `weekdayOf` exported from `streaks.ts` and imported in its test; `computeGameBoard`'s new 4th param matches the call in `me.ts`. No import cycle (`schedule.ts` imports nothing; `streaks.ts`/`gameBoard.ts` import `ALL_DAYS` from it; `me.ts` imports `publishDaysFor`).
