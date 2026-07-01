# Scoring Tracker — Plan 3: Multi-Metric Leaderboard + Per-Game Streaks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single "today's wins" list into a sortable multi-metric leaderboard (wins / games played / win rate) with time windows (daily / weekly / monthly / all-time), plus per-game boards that show each player's best result and their current & longest streak for that game.

**Architecture:** New pure scoring functions (`streaks`, `computeOverall`, `computeGameBoard`) built on the existing `GameEntry`/`tallyWins` foundation, plus small pure date helpers. The leaderboard API gains a `window` param (and an optional `game` param for per-game boards); date-window filtering happens in SQL, streak computation in the pure layer. The UI gets a window selector, click-to-sort column headers, and a per-game board view.

**Tech Stack:** Same as Plans 1–2 — Next.js (App Router, TS), Vitest, `@neondatabase/serverless`. No new dependencies.

## Global Constraints

- **Pure scoring/date functions** (`src/scoring/*`, `src/lib/window.ts`, date helpers in `src/lib/day.ts`): deterministic, no DB/env/I/O, and no `Date.now()` — any "today" is passed in as a `YYYY-MM-DD` string parameter so functions stay testable.
- **Reuse, don't fork:** `GameEntry` and `tallyWins` from `src/scoring/wins.ts` are the win primitive — build on them. `localDateInTz` (`src/lib/day.ts`) already gives "today" in the group timezone.
- **Window semantics (rolling):** `daily` = today only; `weekly` = today and the previous 6 days; `monthly` = today and the previous 29 days; `all` = no lower bound. The window filters **wins / games played / win rate**. **Streaks are always all-time** (current streak is relative to today regardless of the selected window).
- **Streak rule (per game):** a player's streak for a game counts consecutive calendar days (group timezone) on which they logged an on-time active entry *for that game*. The **current** streak is the run ending at the most recent played day, and is only "alive" (non-zero) if that most recent day is today or yesterday; otherwise 0. **Longest** = the longest such run in their whole history for that game.
- **Only on-time active entries count** for every metric: `superseded_by IS NULL AND is_late = false` (matches Plans 1–2).
- **Node runtime** on routes; server-side auth before any DB access; parameterized SQL; no `dangerouslySetInnerHTML` — all per Plans 1–2, do not regress.
- **TDD:** every code task is failing test → run (fail) → minimal impl → run (pass) → commit. Pure modules fully unit-tested; route/UI wiring verified by `npm run build` + the live smoke test (Task 8).

---

### Task 1: Date helpers — day numbers + window start

**Files:**
- Modify: `src/lib/day.ts` (add two exports)
- Create: `src/lib/window.ts`
- Test: `src/lib/day.test.ts` (extend), `src/lib/window.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - In `src/lib/day.ts`: `toDayNumber(dateStr: string): number` (days since epoch for a `YYYY-MM-DD`) and `fromDayNumber(n: number): string`. Used by streak math (Task 2) and window math.
  - In `src/lib/window.ts`: `type Window = "daily" | "weekly" | "monthly" | "all"` and `windowStart(window: Window, today: string): string | null` (earliest `puzzle_date` to include; `null` for all-time). Used by the leaderboard API (Tasks 5–6).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/day.test.ts`:
```ts
import { toDayNumber, fromDayNumber } from "./day";

describe("day numbers", () => {
  it("round-trips a date through day numbers", () => {
    expect(fromDayNumber(toDayNumber("2026-07-01"))).toBe("2026-07-01");
  });
  it("consecutive days differ by exactly 1", () => {
    expect(toDayNumber("2026-07-02") - toDayNumber("2026-07-01")).toBe(1);
  });
  it("spans month boundaries", () => {
    expect(toDayNumber("2026-08-01") - toDayNumber("2026-07-31")).toBe(1);
  });
});
```

`src/lib/window.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { windowStart } from "./window";

describe("windowStart", () => {
  it("daily = today", () => {
    expect(windowStart("daily", "2026-07-15")).toBe("2026-07-15");
  });
  it("weekly = today minus 6 days", () => {
    expect(windowStart("weekly", "2026-07-15")).toBe("2026-07-09");
  });
  it("monthly = today minus 29 days", () => {
    expect(windowStart("monthly", "2026-07-15")).toBe("2026-06-16");
  });
  it("all = null", () => {
    expect(windowStart("all", "2026-07-15")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- day window`
Expected: FAIL — `toDayNumber` not exported / cannot find `./window`.

- [ ] **Step 3: Implement**

Append to `src/lib/day.ts`:
```ts
export function toDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}
```

`src/lib/window.ts`:
```ts
import { toDayNumber, fromDayNumber } from "./day";

export type Window = "daily" | "weekly" | "monthly" | "all";

const SPAN: Record<Exclude<Window, "all">, number> = {
  daily: 0,
  weekly: 6,
  monthly: 29,
};

// Earliest puzzle_date to include for a window, or null for all-time.
export function windowStart(window: Window, today: string): string | null {
  if (window === "all") return null;
  return fromDayNumber(toDayNumber(today) - SPAN[window]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- day window`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/day.ts src/lib/day.test.ts src/lib/window.ts src/lib/window.test.ts
git commit -m "feat: date day-number helpers and rolling windowStart"
```

---

### Task 2: Streak functions (per game)

**Files:**
- Create: `src/scoring/streaks.ts`
- Test: `src/scoring/streaks.test.ts`

**Interfaces:**
- Consumes: `toDayNumber` (Task 1).
- Produces:
  - `currentStreak(datesPlayed: string[], today: string): number` — consecutive days ending at the most recent played day; 0 unless that day is `today` or the day before `today`.
  - `longestStreak(datesPlayed: string[]): number` — longest run of consecutive days in the set.
  Both accept unsorted, possibly-duplicated `YYYY-MM-DD` strings. Used by `computeGameBoard` (Task 4).

- [ ] **Step 1: Write the failing test**

`src/scoring/streaks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { currentStreak, longestStreak } from "./streaks";

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-07-13", "2026-07-14", "2026-07-15"], "2026-07-15")).toBe(3);
  });
  it("stays alive if last play was yesterday", () => {
    expect(currentStreak(["2026-07-13", "2026-07-14"], "2026-07-15")).toBe(2);
  });
  it("is 0 if the last play was more than a day ago", () => {
    expect(currentStreak(["2026-07-10", "2026-07-11"], "2026-07-15")).toBe(0);
  });
  it("ignores duplicates and order", () => {
    expect(currentStreak(["2026-07-15", "2026-07-14", "2026-07-15"], "2026-07-15")).toBe(2);
  });
  it("is 0 for no plays", () => {
    expect(currentStreak([], "2026-07-15")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run", () => {
    expect(longestStreak(["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-10", "2026-07-11"])).toBe(3);
  });
  it("handles a single day", () => {
    expect(longestStreak(["2026-07-01"])).toBe(1);
  });
  it("is 0 for no plays", () => {
    expect(longestStreak([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- streaks`
Expected: FAIL — cannot find module `./streaks`.

- [ ] **Step 3: Implement**

`src/scoring/streaks.ts`:
```ts
import { toDayNumber } from "@/lib/day";

function sortedUniqueDayNumbers(datesPlayed: string[]): number[] {
  return [...new Set(datesPlayed.map(toDayNumber))].sort((a, b) => a - b);
}

export function currentStreak(datesPlayed: string[], today: string): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  const t = toDayNumber(today);
  const latest = days[days.length - 1];
  // Streak is only "current" if the most recent play was today or yesterday.
  if (latest !== t && latest !== t - 1) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (days[i] - days[i - 1] === 1) streak++;
    else break;
  }
  return streak;
}

export function longestStreak(datesPlayed: string[]): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] === 1) run++;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- streaks`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scoring/streaks.ts src/scoring/streaks.test.ts
git commit -m "feat: per-game current and longest streak functions"
```

---

### Task 3: Overall metrics (wins / games played / win rate)

**Files:**
- Create: `src/scoring/leaderboard.ts`
- Test: `src/scoring/leaderboard.test.ts`

**Interfaces:**
- Consumes: `GameEntry`, `tallyWins` (`src/scoring/wins.ts`).
- Produces:
  - `OverallStat = { playerId: string; wins: number; gamesPlayed: number; winRate: number }`.
  - `computeOverall(entries: GameEntry[]): OverallStat[]` — `gamesPlayed` = number of that player's entries; `winRate` = `wins / gamesPlayed` rounded to 2 decimals (0 when `gamesPlayed` is 0). Sorted by wins desc, then winRate desc, then playerId asc. Used by the leaderboard API (Task 5).

- [ ] **Step 1: Write the failing test**

`src/scoring/leaderboard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeOverall } from "./leaderboard";
import type { GameEntry } from "./wins";

const wordle = (playerId: string, puzzleKey: string, value: number): GameEntry => ({
  playerId, gameId: "wordle", variant: null, puzzleKey, value, solved: true, direction: "lower_better",
});

describe("computeOverall", () => {
  it("computes wins, games played, and win rate", () => {
    const entries: GameEntry[] = [
      wordle("a", "wordle|2026-07-01", 3), // a wins day 1
      wordle("b", "wordle|2026-07-01", 4),
      wordle("a", "wordle|2026-07-02", 5), // b wins day 2
      wordle("b", "wordle|2026-07-02", 3),
    ];
    expect(computeOverall(entries)).toEqual([
      { playerId: "a", wins: 1, gamesPlayed: 2, winRate: 0.5 },
      { playerId: "b", wins: 1, gamesPlayed: 2, winRate: 0.5 },
    ]);
  });
  it("win rate is 0 when nothing played", () => {
    expect(computeOverall([])).toEqual([]);
  });
  it("orders by wins desc then win rate desc then id", () => {
    const entries: GameEntry[] = [
      wordle("a", "wordle|2026-07-01", 3),
      wordle("b", "wordle|2026-07-01", 4),
      wordle("b", "wordle|2026-07-02", 3), // b: 1 win / 2 played = 0.5; a: 1 win / 1 played = 1.0
    ];
    const r = computeOverall(entries);
    expect(r.map((x) => x.playerId)).toEqual(["a", "b"]); // tie on wins(1), a has higher winRate
    expect(r[0]).toEqual({ playerId: "a", wins: 1, gamesPlayed: 1, winRate: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — cannot find module `./leaderboard`.

- [ ] **Step 3: Implement**

`src/scoring/leaderboard.ts`:
```ts
import { tallyWins, type GameEntry } from "./wins";

export interface OverallStat {
  playerId: string;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

export function computeOverall(entries: GameEntry[]): OverallStat[] {
  const played = new Map<string, number>();
  for (const e of entries) played.set(e.playerId, (played.get(e.playerId) ?? 0) + 1);

  const winsById = new Map(tallyWins(entries).map((w) => [w.playerId, w.wins]));

  const stats: OverallStat[] = [...played.entries()].map(([playerId, gamesPlayed]) => {
    const wins = winsById.get(playerId) ?? 0;
    const winRate = gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100) / 100;
    return { playerId, wins, gamesPlayed, winRate };
  });

  return stats.sort(
    (a, b) => b.wins - a.wins || b.winRate - a.winRate || a.playerId.localeCompare(b.playerId),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scoring/leaderboard.ts src/scoring/leaderboard.test.ts
git commit -m "feat: computeOverall (wins, games played, win rate)"
```

---

### Task 4: Per-game board metrics (with streaks)

**Files:**
- Create: `src/scoring/gameBoard.ts`
- Test: `src/scoring/gameBoard.test.ts`

**Interfaces:**
- Consumes: `GameEntry` (`src/scoring/wins.ts`), `tallyWins`, `currentStreak`/`longestStreak` (Task 2), `toDayNumber` (Task 1).
- Produces:
  - `DatedGameEntry = GameEntry & { puzzleDate: string }`.
  - `GameBoardStat = { playerId: string; wins: number; gamesPlayed: number; bestValue: number | null; currentStreak: number; longestStreak: number }`.
  - `computeGameBoard(entries: DatedGameEntry[], today: string, start: string | null): GameBoardStat[]` — all `entries` are for ONE game. **Streaks use every entry's date** (all-time); **wins / gamesPlayed / bestValue use only entries with `puzzleDate >= start`** (or all when `start` is null). `bestValue` = best *solved* value by the game's direction in-window (null if none solved in-window). Sorted by wins desc, then bestValue (better first), then playerId asc. Used by the per-game board API (Task 6).

- [ ] **Step 1: Write the failing test**

`src/scoring/gameBoard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeGameBoard, type DatedGameEntry } from "./gameBoard";

const e = (playerId: string, puzzleDate: string, value: number, solved = true): DatedGameEntry => ({
  playerId, gameId: "wordle", variant: null, puzzleKey: `wordle|${puzzleDate}`,
  value, solved, direction: "lower_better", puzzleDate,
});

describe("computeGameBoard", () => {
  it("computes wins, best value, and all-time streaks", () => {
    const entries: DatedGameEntry[] = [
      e("a", "2026-07-13", 4),
      e("a", "2026-07-14", 3),
      e("a", "2026-07-15", 2), // a: 3-day streak, best 2
      e("b", "2026-07-15", 5),
    ];
    // window = all (start null); today = 2026-07-15
    expect(computeGameBoard(entries, "2026-07-15", null)).toEqual([
      { playerId: "a", wins: 3, gamesPlayed: 3, bestValue: 2, currentStreak: 3, longestStreak: 3 },
      { playerId: "b", wins: 0, gamesPlayed: 1, bestValue: 5, currentStreak: 1, longestStreak: 1 },
    ]);
  });
  it("windows wins/played/best but keeps streaks all-time", () => {
    const entries: DatedGameEntry[] = [
      e("a", "2026-07-01", 2), // outside a weekly window ending 07-15
      e("a", "2026-07-14", 4),
      e("a", "2026-07-15", 3),
    ];
    // start = 2026-07-09 (weekly). In-window: 07-14, 07-15 → played 2, best 3. Streak all-time: 07-14,07-15 => 2.
    const r = computeGameBoard(entries, "2026-07-15", "2026-07-09");
    expect(r[0]).toEqual({
      playerId: "a", wins: 2, gamesPlayed: 2, bestValue: 3, currentStreak: 2, longestStreak: 2,
    });
  });
  it("bestValue is null when nothing solved in window", () => {
    const entries: DatedGameEntry[] = [e("a", "2026-07-15", 7, false)];
    const r = computeGameBoard(entries, "2026-07-15", null);
    expect(r[0].bestValue).toBeNull();
    expect(r[0].wins).toBe(0);
    expect(r[0].currentStreak).toBe(1); // played today, even though unsolved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameBoard`
Expected: FAIL — cannot find module `./gameBoard`.

- [ ] **Step 3: Implement**

`src/scoring/gameBoard.ts`:
```ts
import { tallyWins, type GameEntry } from "./wins";
import { currentStreak, longestStreak } from "./streaks";

export type DatedGameEntry = GameEntry & { puzzleDate: string };

export interface GameBoardStat {
  playerId: string;
  wins: number;
  gamesPlayed: number;
  bestValue: number | null;
  currentStreak: number;
  longestStreak: number;
}

function isBetter(a: number, b: number, dir: GameEntry["direction"]): boolean {
  return dir === "lower_better" ? a < b : a > b;
}

export function computeGameBoard(
  entries: DatedGameEntry[],
  today: string,
  start: string | null,
): GameBoardStat[] {
  const inWindow = (d: string) => start === null || d >= start;
  const windowed = entries.filter((e) => inWindow(e.puzzleDate));

  const winsById = new Map(tallyWins(windowed).map((w) => [w.playerId, w.wins]));

  // Per-player aggregates.
  const byPlayer = new Map<string, DatedGameEntry[]>();
  for (const e of entries) {
    let g = byPlayer.get(e.playerId);
    if (!g) { g = []; byPlayer.set(e.playerId, g); }
    g.push(e);
  }

  const stats: GameBoardStat[] = [...byPlayer.entries()].map(([playerId, all]) => {
    const win = all.filter((e) => inWindow(e.puzzleDate));
    const solvedWin = win.filter((e) => e.solved);
    let bestValue: number | null = null;
    for (const e of solvedWin) if (bestValue === null || isBetter(e.value, bestValue, e.direction)) bestValue = e.value;
    const allDates = all.map((e) => e.puzzleDate);
    return {
      playerId,
      wins: winsById.get(playerId) ?? 0,
      gamesPlayed: win.length,
      bestValue,
      currentStreak: currentStreak(allDates, today),
      longestStreak: longestStreak(allDates),
    };
  });

  // Only include players with at least one in-window entry.
  const direction = entries[0]?.direction ?? "lower_better";
  return stats
    .filter((s) => s.gamesPlayed > 0)
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        bestCompare(a.bestValue, b.bestValue, direction) ||
        a.playerId.localeCompare(b.playerId),
    );
}

function bestCompare(a: number | null, b: number | null, dir: GameEntry["direction"]): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls last
  if (b === null) return -1;
  return dir === "lower_better" ? a - b : b - a;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameBoard`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scoring/gameBoard.ts src/scoring/gameBoard.test.ts
git commit -m "feat: computeGameBoard (windowed wins/best + all-time streaks)"
```

---

### Task 5: Leaderboard API — windowed overall board

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Interfaces:**
- Consumes: `computeOverall` (Task 3), `windowStart`/`Window` (Task 1), `localDateInTz`, `sql`, `verifyGroupToken`.
- Produces: `GET /api/leaderboard?window=daily|weekly|monthly|all` → `{ window, players: { displayName, wins, gamesPlayed, winRate }[] }`. Default window `daily`. Auth required.

No unit test (DB + runtime); verified by `npm run build` + Task 8 smoke test.

- [ ] **Step 1: Rewrite the leaderboard route**

`src/app/api/leaderboard/route.ts` (replace entire file):
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { computeOverall } from "@/scoring/leaderboard";
import type { GameEntry } from "@/scoring/wins";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

export async function GET(req: Request) {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groupId = payload.groupId;

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = localDateInTz(groupRows[0].timezone);
  const start = windowStart(window, today);

  const rows = (await sql`
    SELECT e.player_id, p.display_name, e.game_id, e.variant, e.puzzle_date,
           e.parsed_value, e.solved, g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId}
      AND e.superseded_by IS NULL AND e.is_late = false
      AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
      AND e.puzzle_date <= ${today}::date
  `) as {
    player_id: string;
    display_name: string;
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  const names = new Map(rows.map((r) => [r.player_id, r.display_name]));
  const gameEntries: GameEntry[] = rows.map((r) => ({
    playerId: r.player_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = computeOverall(gameEntries).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    wins: s.wins,
    gamesPlayed: s.gamesPlayed,
    winRate: s.winRate,
  }));
  return NextResponse.json({ window, players });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS (all prior + new pure tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat: windowed multi-metric overall leaderboard API"
```

---

### Task 6: Per-game board API

**Files:**
- Create: `src/app/api/games/[gameId]/board/route.ts`

**Interfaces:**
- Consumes: `computeGameBoard`/`DatedGameEntry` (Task 4), `windowStart`/`Window`, `localDateInTz`, `sql`, `verifyGroupToken`.
- Produces: `GET /api/games/<gameId>/board?window=…` → `{ gameId, window, players: { displayName, wins, gamesPlayed, bestValue, currentStreak, longestStreak }[] }`. Auth required. Fetches ALL of the game's on-time active entries (for all-time streaks) and passes the window `start` to `computeGameBoard`.

- [ ] **Step 1: Create the per-game board route**

`src/app/api/games/[gameId]/board/route.ts`:
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { computeGameBoard, type DatedGameEntry } from "@/scoring/gameBoard";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

export async function GET(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groupId = payload.groupId;
  const gameId = params.gameId;

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = localDateInTz(groupRows[0].timezone);
  const start = windowStart(window, today);

  // Fetch ALL of the game's on-time active entries (streaks are all-time).
  const rows = (await sql`
    SELECT e.player_id, p.display_name, e.variant, e.puzzle_date, e.parsed_value, e.solved,
           g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId} AND e.game_id = ${gameId}
      AND e.superseded_by IS NULL AND e.is_late = false
      AND e.puzzle_date <= ${today}::date
  `) as {
    player_id: string;
    display_name: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  const names = new Map(rows.map((r) => [r.player_id, r.display_name]));
  const entries: DatedGameEntry[] = rows.map((r) => ({
    playerId: r.player_id,
    gameId,
    variant: r.variant,
    puzzleKey: `${gameId}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
    puzzleDate: r.puzzle_date,
  }));

  const players = computeGameBoard(entries, today, start).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    wins: s.wins,
    gamesPlayed: s.gamesPlayed,
    bestValue: s.bestValue,
    currentStreak: s.currentStreak,
    longestStreak: s.longestStreak,
  }));
  return NextResponse.json({ gameId, window, players });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles; `/api/games/[gameId]/board` listed as a dynamic route.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/games/[gameId]/board/route.ts"
git commit -m "feat: per-game board API with all-time streaks"
```

---

### Task 7: UI — window selector, sortable overall table, per-game board

**Files:**
- Modify: `src/app/tracker.tsx`

**Interfaces:**
- Consumes: `GET /api/leaderboard?window=…`, `GET /api/games/<id>/board?window=…`, existing `GET /api/games`.
- Produces: user-facing leaderboard UI. No exports.

Behavior: a window selector (Daily/Weekly/Monthly/All-time) applying to both views. The overall table shows Player / Wins / Played / Win % with clickable headers to sort by any column. A "per-game board" section: pick a game → shows Player / Wins / Best / Current streak / Longest streak for that game. Both refetch when the window changes and after a successful submit.

- [ ] **Step 1: Replace the tracker component**

`src/app/tracker.tsx` (replace entire file):
```tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { parseClock } from "@/lib/time";

type Game = { id: string; name: string; type: string; metricDirection: string; hasVariants: boolean };
type OverallRow = { displayName: string; wins: number; gamesPlayed: number; winRate: number };
type GameRow = {
  displayName: string; wins: number; gamesPlayed: number;
  bestValue: number | null; currentStreak: number; longestStreak: number;
};
type Window = "daily" | "weekly" | "monthly" | "all";
type SortKey = "wins" | "gamesPlayed" | "winRate";

export function Tracker() {
  const [authed, setAuthed] = useState(false);
  const authedRef = useRef(false);
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState("");
  const [variant, setVariant] = useState("easy");
  const [manualValue, setManualValue] = useState("");
  const [solved, setSolved] = useState(true);

  const [window, setWindow] = useState<Window>("daily");
  const [overall, setOverall] = useState<OverallRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [boardGameId, setBoardGameId] = useState("");
  const [gameBoard, setGameBoard] = useState<GameRow[]>([]);

  const markAuthed = () => { setAuthed(true); authedRef.current = true; };

  const loadOverall = useCallback(async (w: Window) => {
    try {
      const res = await fetch(`/api/leaderboard?window=${w}`);
      if (res.ok) { setOverall((await res.json()).players); markAuthed(); return; }
      if (res.status === 401) return;
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    } catch { if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again."); }
  }, []);

  const loadGames = useCallback(async () => {
    const res = await fetch("/api/games");
    if (res.ok) {
      const data = await res.json();
      setGames(data.games);
      if (data.games[0]) { setGameId((g) => g || data.games[0].id); setBoardGameId((g) => g || data.games[0].id); }
    }
  }, []);

  const loadGameBoard = useCallback(async (g: string, w: Window) => {
    if (!g) return;
    const res = await fetch(`/api/games/${g}/board?window=${w}`);
    if (res.ok) setGameBoard((await res.json()).players);
  }, []);

  useEffect(() => { loadOverall(window); }, [loadOverall, window]);
  useEffect(() => { if (authed) loadGames(); }, [authed, loadGames]);
  useEffect(() => { if (authed && boardGameId) loadGameBoard(boardGameId, window); }, [authed, boardGameId, window, loadGameBoard]);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) { markAuthed(); loadOverall(window); loadGames(); }
    else { const d = await res.json().catch(() => ({})); setMessage(d.error ?? "Wrong passphrase"); }
  }

  async function submitEntry(payload: object) {
    const res = await fetch("/api/entries", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, pin, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Saved: ${data.parsed?.gameId ?? "entry"} (${data.parsed?.value ?? ""})`);
      loadOverall(window);
      loadGameBoard(boardGameId, window);
      return true;
    }
    setMessage(data.error ?? "Something went wrong — try again.");
    return false;
  }

  async function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    if (await submitEntry({ rawInput })) setRawInput("");
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const game = games.find((g) => g.id === gameId);
    if (!game) { setMessage("Pick a game"); return; }
    const value = game.type === "timed"
      ? parseClock(manualValue)
      : (/^\d+$/.test(manualValue.trim()) ? Number(manualValue.trim()) : null);
    if (value === null) { setMessage("Enter a valid value (time as m:ss, or a number)"); return; }
    if (await submitEntry({ gameId, variant: game.hasVariants ? variant : null, value, solved })) setManualValue("");
  }

  if (!authed) {
    return (
      <form onSubmit={submitPassphrase}>
        <h1>Enter group passphrase</h1>
        <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="passphrase" />
        <button type="submit">Enter</button>
        <p>{message}</p>
      </form>
    );
  }

  const selectedGame = games.find((g) => g.id === gameId);
  const sortedOverall = [...overall].sort((a, b) => b[sortKey] - a[sortKey]);
  const th = (label: string, key: SortKey) => (
    <th onClick={() => setSortKey(key)} style={{ cursor: "pointer" }}>
      {label}{sortKey === key ? " ▼" : ""}
    </th>
  );

  return (
    <main>
      <h1>Scoring Tracker</h1>

      <section>
        <h2>Who are you?</h2>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
      </section>

      <section>
        <h2>Paste a result</h2>
        <form onSubmit={submitPaste}>
          <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder="Paste your result (e.g. Wordle 1,234 3/6)" />
          <button type="submit">Submit paste</button>
        </form>
      </section>

      <section>
        <h2>Or enter manually</h2>
        <form onSubmit={submitManual}>
          <select value={gameId} onChange={(e) => { setGameId(e.target.value); setVariant("easy"); }}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {selectedGame?.hasVariants && (
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          )}
          <input value={manualValue} onChange={(e) => setManualValue(e.target.value)}
            placeholder={selectedGame?.type === "timed" ? "time m:ss" : "guesses / mistakes"} />
          <label><input type="checkbox" checked={solved} onChange={(e) => setSolved(e.target.checked)} /> Solved</label>
          <button type="submit">Submit manually</button>
        </form>
      </section>

      <p>{message}</p>

      <section>
        <h2>Leaderboard</h2>
        <label>Window:{" "}
          <select value={window} onChange={(e) => setWindow(e.target.value as Window)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option><option value="all">All-time</option>
          </select>
        </label>
        <table>
          <thead><tr><th>Player</th>{th("Wins", "wins")}{th("Played", "gamesPlayed")}{th("Win %", "winRate")}</tr></thead>
          <tbody>
            {sortedOverall.map((r) => (
              <tr key={r.displayName}>
                <td>{r.displayName}</td><td>{r.wins}</td><td>{r.gamesPlayed}</td><td>{Math.round(r.winRate * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Per-game board</h2>
        <select value={boardGameId} onChange={(e) => setBoardGameId(e.target.value)}>
          {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <table>
          <thead><tr><th>Player</th><th>Wins</th><th>Best</th><th>Current streak</th><th>Longest streak</th></tr></thead>
          <tbody>
            {gameBoard.map((r) => (
              <tr key={r.displayName}>
                <td>{r.displayName}</td><td>{r.wins}</td><td>{r.bestValue ?? "—"}</td>
                <td>{r.currentStreak}</td><td>{r.longestStreak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/tracker.tsx
git commit -m "feat: window selector, sortable overall table, per-game board UI"
```

---

### Task 8: Live smoke test (documented; requires Neon)

**Files:** none.

- [ ] **Step 1: Ensure DB is current**

```bash
cd "<project root>"
set -a && . ./.env.local && set +a
node scripts/migrate.mjs && node scripts/seed.mjs
```

- [ ] **Step 2: Exercise the new endpoints**

Start `npm run dev`, authenticate (as in prior smoke tests), then verify:
- `GET /api/leaderboard?window=all` → players include `wins`, `gamesPlayed`, `winRate`.
- `GET /api/leaderboard?window=daily` vs `?window=all` → daily is a subset (fewer/equal games played).
- Submit the same game on two different days (backdating isn't in the app yet, so this needs two real days OR temporarily insert rows with different `puzzle_date` via a one-off script) and confirm `GET /api/games/wordle/board?window=all` shows `currentStreak`/`longestStreak` ≥ 2 for a player with consecutive days.
- `GET /api/games/pips/board?window=all` → per-variant note: streaks/wins aggregate across variants for the game (acceptable for v1; per-variant boards can come later).

Expected: overall board is windowed and multi-metric; per-game board shows best value + streaks.

- [ ] **Step 3: (optional) clear test data** — same snippet as Plan 2 Task 11 Step 3.

---

## Self-Review

**Spec coverage (design spec §6 read-side):**
- Sortable table with wins / games played / win rate → Tasks 3, 5, 7 (clickable headers). ✅
- Time windows daily/weekly/monthly/all-time → Tasks 1, 5, 6, 7. ✅
- Per-game boards → Tasks 4, 6, 7. ✅
- Streaks (per user's decision: **per-game** current + longest) → Tasks 2, 4, 6, 7. ✅
- On-time-active-only consistency → SQL filter `superseded_by IS NULL AND is_late = false` in Tasks 5, 6. ✅
- Deferred to Plan 4 (by scope decision): daily-lock / no-peek, late-entry/backfill, admin. Not gaps.

**Placeholder scan:** No TBD/TODO; every code step has complete code. Task 8's "insert rows with different puzzle_date" is a described smoke-test technique, not a code placeholder. ✅

**Type consistency:** `Window`/`windowStart` (Task 1) consumed unchanged in Tasks 5/6/7. `toDayNumber` (Task 1) used by streaks (Task 2) and windows. `GameEntry`/`tallyWins` reused (Tasks 3, 4). `OverallStat`/`computeOverall` (Task 3) consumed by Task 5; `DatedGameEntry`/`GameBoardStat`/`computeGameBoard` (Task 4) consumed by Task 6. API response shapes (`{window, players:[…]}` with `winRate`; per-game `{gameId, window, players:[… bestValue, currentStreak, longestStreak]}`) match the UI `OverallRow`/`GameRow` types (Task 7). `winRate` is a 0–1 fraction end to end; the UI multiplies by 100 for display. ✅
