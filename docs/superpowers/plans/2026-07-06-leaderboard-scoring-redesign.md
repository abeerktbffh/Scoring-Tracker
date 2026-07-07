# Leaderboard & Scoring Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make results read properly per game (real units + solved/failed), make per-game boards the star ranked by daily wins (medals) with a light Overall medal tally, and let friends see the process (grids/stats) via a today-only inline collapsible — all on a new structured per-result `detail` model that keeps the existing ranking scalar untouched.

**Architecture:** Additive. Parsers keep emitting `value`/`solved` (the unchanged ranking inputs) and gain an optional structured `detail`. A new `entries.detail JSONB` column stores it; a backfill re-parses existing `raw_input`. A pure `formatResult` renders every value in proper units everywhere. A pure medals layer (`src/scoring/medals.ts`) turns the existing per-puzzle daily-win into gold/silver/bronze placements, aggregate medal-tally boards, an Overall medal tally, and a today-only live contest. The Board screen collapses to one control row (Game ▾ + Window ▾); the group switcher stays in the top bar. Today game-board rows expand inline to stat pills + verbatim grid; aggregate rows stay flat.

**Tech Stack:** Next.js 14.2 App Router, TypeScript, Neon Postgres (`@neondatabase/serverless` HTTP driver — stateless, NO interactive transactions), Auth.js v5, Vitest (node env for lib/scoring/parser tests; jsdom via a `// @vitest-environment jsdom` docblock for component tests, @testing-library/react).

## Global Constraints

- **Keep the UI as simple as possible (binding, owner-stated).** Collapsed rows stay minimal — `rank · name · value-or-medals · chevron-where-expandable`. ALL richness (stat pills, grids, extra metrics, sub-lines) lives inside the collapsible or a muted sub-line, revealed only on tap. ONE control row on the Board screen (Game ▾ + Window ▾). The group switcher stays in the top bar. No chip strip, no segment strip, no third filter. When in doubt, hide detail behind a tap rather than crowd the row.
- **The ranking scalar is unchanged.** `parsed_value` + `solved` remain the ONLY ranking inputs and continue to drive daily-win/medal computation exactly as today. `detail` is display/analytics only. Parsers keep emitting the same `value`/`solved` and ADD `detail`; never change an existing `value`/`solved`.
- **`formatResult` and all medal/placement logic are PURE and unit-tested** (no DB, no DOM, no `Date.now`).
- **Stateless DB driver:** no interactive transactions, no `FOR UPDATE`. Concurrency correctness comes from partial UNIQUE indexes + catching Postgres `23505` (see `src/lib/dbError.ts` `isUniqueViolation`), never check-then-write. The `detail` change adds no new write races (it rides the existing supersede/insert).
- **Migrations** are applied by `scripts/migrate.mjs`, which splits `src/db/schema.sql` on `;` — **never put a `;` inside a SQL comment.** Every DDL uses `IF NOT EXISTS` so re-running is safe.
- **CI must stay green and the build secret-free:** `npm run typecheck && npm run lint && npm test && npm run build` all pass.
- **No production merge or prod DB change without the owner's explicit go-ahead.** See "Deploy gates".
- **One coordinated build.** All work on branch `feat/leaderboard-redesign` (off `main`); ONE PR; ONE gated deploy. The three phases below are an internal build order only — there is NO intermediate release/deploy between them.
- **Platform timezone** is `Asia/Kolkata` via `PLATFORM_TZ` (unchanged).
- **All 14 parser-backed games are `lower_better`.** NYT Mini has no parser (manual-only) — it still formats via `formatResult` as a timed game and simply never produces `detail`.

## Deploy gates (guided, controller-run — NOT code tasks)

Performed by the controller with explicit owner go-ahead, after all code tasks are merged-ready. Listed here so they are not forgotten. This ships as ONE deploy:

- **G0 — backup:** create a backup branch + annotated tag on `origin/main` HEAD and push both.
- **G1 — migrate:** apply `src/db/schema.sql` (the new `entries.detail JSONB` column) to the **preview** Neon branch via `scripts/migrate.mjs`; confirm clean.
- **G2 — backfill (preview → prod):** run `npx tsx scripts/backfill-detail.mjs --dry-run` against preview and confirm re-parse coverage; then, with owner go-ahead, apply the migration to **prod** and run `npx tsx scripts/backfill-detail.mjs` against prod. Rows that fail to re-parse keep `detail=null` and fall back to scalar display — no data loss.
- **G3 — merge & deploy:** merge the single PR; deploy. Nothing reaches prod without the owner's explicit go-ahead.

---

## File structure

**Types & pure helpers**
- `src/parsers/types.ts` — add `ResultDetail`, extend `ParseResult` with optional `detail` (Task 1).
- `src/lib/time.ts` — add `formatClock` (mm:ss inverse of `parseClock`) (Task 2).
- `src/lib/formatResult.ts` — **new**: pure `formatResult` + `RESULT_SHAPE` map (Task 3).
- `src/lib/backfillDetailVerify.ts` — **new**: pure re-parse coverage summary (Task 7).
- `src/scoring/medals.ts` — **new**: `tallyMedals`, `computeMedalBoard`, `computeOverallMedals`, `computeDailyContest` (Tasks 10–13). Reuses `isBetter`/`GameEntry`/`DatedGameEntry` from `wins.ts`/`gameBoard.ts`.

**Parsers (add `detail`; keep `value`/`solved`)**
- `src/parsers/wordle.ts` (Task 4, worked example).
- `src/parsers/connections.ts`, `strands.ts`, `pinpoint.ts`, `minuteCryptic.ts`, `pips.ts`, `indiaMini.ts`, `linkedin.ts` (Task 5).

**Storage & scripts**
- `src/db/schema.sql` — additive `entries.detail JSONB` column (Task 6).
- `scripts/backfill-detail.mjs` — **new**: re-parse `raw_input` → `detail` (Task 7).

**Write path**
- `src/lib/submission.ts` — `ResolvedSubmission` carries `detail` (Task 8).
- `src/app/api/entries/route.ts` — persist `detail` (Task 8).

**Read path**
- `src/app/api/games/[gameId]/board/route.ts` — daily contest vs aggregate medal tally + `detail` (Task 14).
- `src/app/api/leaderboard/route.ts` — Overall medal tally (Task 15).
- `src/app/api/me/route.ts` — select `detail` for `recent` (Task 9).
- `src/lib/api.ts` — new client types: `ResultDetail`, `MedalCounts`, reshaped `OverallRow`, `MedalBoardRow`, `DailyContestRow` (Tasks 9, 14, 15).
- `src/lib/leaderboardSort.ts` — `sortByMedals` replaces win-key sort (Task 15).

**Client / display**
- `src/app/(app)/you/page.tsx` — recent list in proper units (Task 9).
- `src/components/GameWindowNav.tsx` — **new**: the one control row (Game ▾ + Window ▾), Menu-based (Task 16).
- `src/components/MedalBoardTable.tsx` — **new**: flat aggregate medal board (Task 16).
- `src/components/DailyContestTable.tsx` — **new**: today's live contest (flat in Task 16; expandable in Task 18).
- `src/app/(app)/standings/page.tsx` — reshaped to Game ▾/Window ▾ + Overall/medal/contest (Task 16).
- `src/components/LeaderboardTable.tsx` — Overall medal columns (Task 17).
- `src/app/(app)/page.tsx` (Home) — snapshot of Overall medal tally (Task 17).
- `src/components/StatPills.tsx` + `src/components/ResultGrid.tsx` — **new**: today-only collapsible content (Task 18).
- `src/design/icons.tsx` — add a `Medal` glyph if needed (Task 18; medals otherwise rendered as 🥇🥈🥉).

---

## Task 1: Extend the parser contract with structured `detail`

**Files:**
- Modify: `src/parsers/types.ts`
- Test: `src/parsers/types.test.ts` (new)

**Interfaces:**
- Produces: `ResultDetail` (open per-game shape) and `ParseResult.detail?: ResultDetail | null`. Consumed by every parser (Tasks 4–5), `submission.ts` (Task 8), the backfill (Task 7), and `formatResult`/components (Tasks 3, 18).

- [ ] **Step 1: Write the failing test**

Create `src/parsers/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { ParseResult, ResultDetail } from "./types";

describe("ParseResult detail contract", () => {
  it("accepts a structured detail alongside the ranking scalar", () => {
    const detail: ResultDetail = { guesses: 3, solved: true, hardMode: true, grid: ["🟩🟩🟩🟩🟩"] };
    const r: ParseResult = {
      gameId: "wordle",
      puzzleNumber: 1,
      variant: null,
      value: 3,
      solved: true,
      detail,
    };
    expect(r.detail?.grid?.length).toBe(1);
    expect(r.detail?.seconds).toBeUndefined();
  });

  it("treats detail as optional (parsers may omit it)", () => {
    const r: ParseResult = { gameId: "nyt-mini", puzzleNumber: null, variant: null, value: 48, solved: true };
    expect(r.detail).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parsers/types.test.ts`
Expected: FAIL — `"ResultDetail" is not exported` / type error.

- [ ] **Step 3: Write minimal implementation**

Replace `src/parsers/types.ts` with:
```ts
/**
 * Structured per-result detail — display/analytics only. NEVER a ranking
 * input (the scalar `value` + `solved` remain the sole ranking inputs).
 * One open shape covers every game; each parser fills only its own fields.
 * Stored verbatim in `entries.detail JSONB`.
 */
export interface ResultDetail {
  // Guesses (Wordle, Pinpoint)
  guesses?: number | null;
  solved?: boolean;
  hardMode?: boolean;       // Wordle
  trail?: number[];         // Pinpoint %-match trail
  // Mistakes (Connections)
  mistakes?: number;
  solvedAll?: boolean;
  // Hints (Strands, Minute Cryptic)
  hints?: number;
  theme?: string | null;    // Strands
  underPar?: number | null; // Minute Cryptic
  // Timed (Queens/Tango/Mini Sudoku/India Mini/NYT Mini/Zip/Crossclimb/Patches/Wend/Pips)
  seconds?: number;
  backtracks?: number;      // Zip
  redraws?: number;         // Patches
  fillOrder?: number[];     // Crossclimb
  difficulty?: string;      // Pips (easy/medium/hard)
  // Shared verbatim grid (Wordle/Connections/Strands)
  grid?: string[];
}

export interface ParseResult {
  gameId: string;
  puzzleNumber: number | null;
  variant: string | null;
  value: number;
  solved: boolean;
  /** Optional structured detail; display/analytics only. */
  detail?: ResultDetail | null;
}

export interface Parser {
  gameId: string;
  detect(text: string): boolean;
  parse(text: string): ParseResult;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parsers/types.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/types.ts src/parsers/types.test.ts
git commit -m "feat(parsers): add optional structured ResultDetail to ParseResult"
```

---

## Task 2: `formatClock` — the mm:ss inverse of `parseClock`

**Files:**
- Modify: `src/lib/time.ts`
- Test: `src/lib/time.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `formatClock(totalSeconds: number): string` — used by `formatResult` (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/time.test.ts`:
```ts
import { formatClock } from "./time";

describe("formatClock", () => {
  it("formats whole minutes and zero-padded seconds", () => {
    expect(formatClock(593)).toBe("9:53");
  });
  it("zero-pads seconds under ten and shows 0 minutes", () => {
    expect(formatClock(31)).toBe("0:31");
    expect(formatClock(5)).toBe("0:05");
  });
  it("handles exact minutes and zero", () => {
    expect(formatClock(120)).toBe("2:00");
    expect(formatClock(0)).toBe("0:00");
  });
  it("floors fractional and clamps negatives to 0:00", () => {
    expect(formatClock(90.9)).toBe("1:30");
    expect(formatClock(-5)).toBe("0:00");
  });
});
```
(If `time.test.ts` has no `describe` import yet, it already imports `describe, it, expect` from vitest — reuse the existing top-of-file import; add only the `formatClock` import and the new `describe` block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/time.test.ts -t formatClock`
Expected: FAIL — `formatClock is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/time.ts`:
```ts
// Inverse of parseClock for display: total seconds -> "m:ss" (zero-padded
// seconds). 593 -> "9:53", 31 -> "0:31". Floors fractional seconds and
// clamps negatives to "0:00". mm:ss only (no hours) — matches the games.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/time.test.ts -t formatClock`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts
git commit -m "feat(time): add formatClock mm:ss formatter"
```

---

## Task 3: `formatResult` — the single value formatter (pure)

**Files:**
- Create: `src/lib/formatResult.ts`
- Test: `src/lib/formatResult.test.ts`

**Interfaces:**
- Consumes: `formatClock` (Task 2), `ResultDetail` (Task 1).
- Produces:
  - `type ResultShape = "timed" | "wordle" | "pinpoint" | "connections" | "hints"`
  - `RESULT_SHAPE: Record<string, ResultShape>`
  - `shapeForGame(gameId: string): ResultShape`
  - `formatResult(gameId: string, value: number, solved: boolean, detail?: ResultDetail | null): string`
  - Used everywhere a value renders: You recent (Task 9), boards (Tasks 14, 16), stat pills (Task 18), log confirmation.

> **Judgment call (flagged for controller):** the spec sketches `formatResult(gameType, metric, value, solved, detail)`. This collapses `(gameType, metric)` into a single `gameId` lookup (`RESULT_SHAPE`) so callers never pass a redundant metric — the shape is a function of the game. The `detail` param is accepted for forward use (e.g. pinpoint singular) but the core unit rules key off `gameId`+`value`+`solved`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/formatResult.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatResult, shapeForGame } from "./formatResult";

describe("shapeForGame", () => {
  it("maps each game to its value shape", () => {
    expect(shapeForGame("wordle")).toBe("wordle");
    expect(shapeForGame("pinpoint")).toBe("pinpoint");
    expect(shapeForGame("connections")).toBe("connections");
    expect(shapeForGame("strands")).toBe("hints");
    expect(shapeForGame("minute-cryptic")).toBe("hints");
    expect(shapeForGame("pips")).toBe("timed");
    expect(shapeForGame("queens")).toBe("timed");
    expect(shapeForGame("nyt-mini")).toBe("timed");
  });
  it("defaults unknown games to timed", () => {
    expect(shapeForGame("totally-new-game")).toBe("timed");
  });
});

describe("formatResult", () => {
  it("timed -> mm:ss (incl. 0:0N and 9:53)", () => {
    expect(formatResult("queens", 31, true)).toBe("0:31");
    expect(formatResult("pips", 593, true)).toBe("9:53");
  });
  it("Wordle solved -> n/6 with a check; failed -> X/6 with a cross (never raw 7)", () => {
    expect(formatResult("wordle", 3, true)).toBe("3/6 ✓");
    expect(formatResult("wordle", 7, false)).toBe("X/6 ✗");
  });
  it("Pinpoint -> guesses with singular/plural", () => {
    expect(formatResult("pinpoint", 3, true)).toBe("3 guesses");
    expect(formatResult("pinpoint", 1, true)).toBe("1 guess");
  });
  it("Connections -> Perfect / N mistakes / Failed", () => {
    expect(formatResult("connections", 0, true)).toBe("Perfect");
    expect(formatResult("connections", 2, true)).toBe("2 mistakes");
    expect(formatResult("connections", 1, true)).toBe("1 mistake");
    expect(formatResult("connections", 4, false)).toBe("Failed");
  });
  it("Hints -> No hints / N hints", () => {
    expect(formatResult("strands", 0, true)).toBe("No hints");
    expect(formatResult("strands", 2, true)).toBe("2 hints");
    expect(formatResult("minute-cryptic", 1, true)).toBe("1 hint");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/formatResult.test.ts`
Expected: FAIL — cannot find module `./formatResult`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/formatResult.ts`:
```ts
import { formatClock } from "./time";
import type { ResultDetail } from "@/parsers/types";

export type ResultShape = "timed" | "wordle" | "pinpoint" | "connections" | "hints";

// Per-game value shape. Everything not listed is timed (mm:ss) — including
// NYT Mini (manual, no parser) and any future timed game.
export const RESULT_SHAPE: Record<string, ResultShape> = {
  wordle: "wordle",
  pinpoint: "pinpoint",
  connections: "connections",
  strands: "hints",
  "minute-cryptic": "hints",
  pips: "timed",
  queens: "timed",
  tango: "timed",
  "mini-sudoku": "timed",
  "india-mini": "timed",
  zip: "timed",
  crossclimb: "timed",
  patches: "timed",
  wend: "timed",
  "nyt-mini": "timed",
};

export function shapeForGame(gameId: string): ResultShape {
  return RESULT_SHAPE[gameId] ?? "timed";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Renders a board/pill value in the game's proper units. PURE.
 * The ranking scalar `value` + `solved` are the only inputs that matter for
 * the numbers; `detail` is accepted for forward use. Never leaks the Wordle
 * sentinel 7 — a failed Wordle renders "X/6 ✗".
 */
export function formatResult(
  gameId: string,
  value: number,
  solved: boolean,
  _detail?: ResultDetail | null,
): string {
  switch (shapeForGame(gameId)) {
    case "timed":
      return formatClock(value);
    case "wordle":
      return solved ? `${value}/6 ✓` : "X/6 ✗";
    case "pinpoint":
      return plural(value, "guess", "guesses");
    case "connections":
      if (!solved) return "Failed";
      return value === 0 ? "Perfect" : plural(value, "mistake", "mistakes");
    case "hints":
      return value === 0 ? "No hints" : plural(value, "hint", "hints");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/formatResult.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatResult.ts src/lib/formatResult.test.ts
git commit -m "feat(format): add pure formatResult value formatter"
```

---

## Task 4: Wordle parser — `detail` extraction (worked example for Task 5)

**Files:**
- Modify: `src/parsers/wordle.ts`
- Test: `src/parsers/wordle.test.ts` (append)

**Interfaces:**
- Consumes: `ResultDetail` (Task 1).
- Produces: `wordleParser.parse` now returns `detail: { guesses, solved, hardMode, grid }`. Same `value`/`solved` as before (unchanged ranking).

- [ ] **Step 1: Write the failing test**

Append to `src/parsers/wordle.test.ts`:
```ts
describe("wordle detail", () => {
  it("captures guesses, solved, hardMode, and the verbatim grid", () => {
    const text = "Wordle 1,234 3/6*\n\n⬛🟨⬛⬛⬛\n⬛🟩🟨⬛⬛\n🟩🟩🟩🟩🟩";
    expect(wordleParser.parse(text).detail).toEqual({
      guesses: 3,
      solved: true,
      hardMode: true,
      grid: ["⬛🟨⬛⬛⬛", "⬛🟩🟨⬛⬛", "🟩🟩🟩🟩🟩"],
    });
  });
  it("marks a failed Wordle solved:false, guesses:null, and never emits the sentinel 7 in detail", () => {
    const d = wordleParser.parse("Wordle 900 X/6").detail;
    expect(d).toEqual({ guesses: null, solved: false, hardMode: false, grid: [] });
  });
  it("keeps the ranking scalar unchanged", () => {
    expect(wordleParser.parse("Wordle 1,234 3/6\n\n🟩🟩🟩🟩🟩").value).toBe(3);
    expect(wordleParser.parse("Wordle 900 X/6").value).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parsers/wordle.test.ts -t "wordle detail"`
Expected: FAIL — `detail` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

Replace `src/parsers/wordle.ts` with:
```ts
import type { Parser, ParseResult } from "./types";

const LINE = /^Wordle\s+([\d,]+)\s+([X\d])\/6/im;
// Wordle tiles: dark/light blanks + present/correct, plus colorblind variants.
const TILE = /[⬛⬜🟨🟩🟧🟦]/gu;

function wordleGrid(text: string): string[] {
  return text
    .split("\n")
    .map((line) => [...line.matchAll(TILE)].map((m) => m[0]))
    .filter((sq) => sq.length === 5)
    .map((sq) => sq.join(""));
}

export const wordleParser: Parser = {
  gameId: "wordle",
  detect(text: string): boolean {
    return LINE.test(text);
  },
  parse(text: string): ParseResult {
    const m = text.match(LINE);
    if (!m) throw new Error("Not a Wordle result");
    const puzzleNumber = Number(m[1].replace(/,/g, ""));
    const guesses = m[2].toUpperCase();
    const solved = guesses !== "X";
    // Hard mode is shown as "3/6*" in the header line.
    const hardMode = /\/6\*/.test(text);
    return {
      gameId: "wordle",
      puzzleNumber,
      variant: null,
      value: solved ? Number(guesses) : 7,
      solved,
      detail: {
        guesses: solved ? Number(guesses) : null,
        solved,
        hardMode,
        grid: wordleGrid(text),
      },
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parsers/wordle.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/wordle.ts src/parsers/wordle.test.ts
git commit -m "feat(parsers): wordle emits structured detail (guesses/hardMode/grid)"
```

---

## Task 5: Remaining 13 parsers — `detail` extraction (apply the Task 4 pattern)

**DRY note (plan-level, deliberate):** every parser follows the SAME shape as Task 4 — add a `detail` object to the returned `ParseResult`, leave `value`/`solved` untouched, and append a `describe("<game> detail", …)` block asserting the exact `detail` shape from a real sample. Rather than repeat 13 near-identical worked examples, this task gives (a) the exact `detail` fields per parser copied verbatim from the spec's per-game reference, (b) a real sample string (reuse the existing `*.test.ts` samples), (c) the exact extraction code, and (d) one shared test-assertion pattern. Apply the pattern parser-by-parser.

**Files:**
- Modify: `src/parsers/connections.ts`, `strands.ts`, `pinpoint.ts`, `minuteCryptic.ts`, `pips.ts`, `indiaMini.ts`, `linkedin.ts`
- Test: the matching `*.test.ts` for each (append a `detail` block)

**Interfaces:**
- Consumes: `ResultDetail` (Task 1).
- Produces: each parser's `parse` returns the game's `detail` shape below. `makeLinkedInTimedParser` gains a 3rd param `extractDetail?: (text: string, seconds: number) => ResultDetail` (default `(_t, seconds) => ({ seconds })`).

**Per-parser `detail` shapes (verbatim from spec) + sample + extraction:**

| Parser (file) | `detail` fields | Real sample (from `*.test.ts`) | Extraction |
|---|---|---|---|
| Connections (`connections.ts`) | `{ mistakes, solvedAll, grid }` | SOLVED sample (puzzle #1116, 6 rows) → `mistakes:2, solvedAll:true, grid:["🟩🟦🟪🟪","🟦🟨🟨🟨","🟨🟨🟨🟨","🟩🟩🟩🟩","🟦🟦🟦🟦","🟪🟪🟪🟪"]` | reuse `rows`/`mono`: `grid: rows.map((r)=>r.join(""))`, `mistakes: rows.length - mono`, `solvedAll: mono === 4` |
| Strands (`strands.ts`) | `{ hints, theme, grid }` | `Strands #851\n"Added flavor"\n🔵🔵🔵🔵\n🔵🟡` → `hints:0, theme:"Added flavor", grid:["🔵🔵🔵🔵","🔵🟡"]` | `theme: text.match(/"([^"]+)"/)?.[1] ?? null`; grid via `/[🔵🟡💡]/gu` per line, keep non-empty |
| Pinpoint (`pinpoint.ts`) | `{ guesses, solved, trail }` | SAMPLE (#793, 3 guesses, 33/3/100%) → `guesses:3, solved:true, trail:[33,3,100]` | `trail: [...text.matchAll(/(\d+)%\s*match/gi)].map((m)=>Number(m[1]))` |
| Minute Cryptic (`minuteCryptic.ts`) | `{ hints, underPar }` | SAMPLE (0 hints, 3 under par) → `hints:0, underPar:3` | `underPar: text.match(/(\d+)\s+under the community par/i) ? Number(RegExp.$1) : null` — capture via a named local match (see code below) |
| Pips (`pips.ts`) | `{ seconds, difficulty }` | `Pips #317 Hard 🔴\n9:53` → `seconds:593, difficulty:"hard"` | `detail: { seconds: value, difficulty: h[2].toLowerCase() }` |
| India Mini (`indiaMini.ts`) | `{ seconds }` | SAMPLE (5m20s) → `seconds:320` | `detail: { seconds }` |
| Zip (`linkedin.ts`) | `{ seconds, backtracks }` | `Zip #472 | 0:12 🏁\nWith 1 backtrack 🛑` → `seconds:12, backtracks:1` | `(text, seconds) => ({ seconds, backtracks: text.match(/(\d+)\s+backtrack/i) ? Number(RegExp.$1) : 0 })` |
| Crossclimb (`linkedin.ts`) | `{ seconds, fillOrder }` | `Crossclimb #793 | 1:28\nFill order: 1️⃣ 2️⃣ 3️⃣` → `seconds:88, fillOrder:[1,2,3]` | keycap regex `/([0-9])️?⃣/gu` |
| Patches (`linkedin.ts`) | `{ seconds, hints, redraws }` | `Patches #107 | 0:19 🧶\nWith no hints & 1 redraw` → `seconds:19, hints:0, redraws:1` | `no hints`→0 else `(\d+)\s+hints?`; `(\d+)\s+redraws?` |
| Wend (`linkedin.ts`) | `{ seconds, hints }` | `Wend #24 | 0:45 🌀\nWith no hints` → `seconds:45, hints:0` | `no hints`→0 else `(\d+)\s+hints?` |
| Queens (`linkedin.ts`) | `{ seconds }` | `Queens #792\n0:31 👑` → `seconds:31` | default extractor `(_t, seconds) => ({ seconds })` |
| Tango (`linkedin.ts`) | `{ seconds }` | `Tango #632\n0:23 🌗` → `seconds:23` | default extractor |
| Mini Sudoku (`linkedin.ts`) | `{ seconds }` | `Mini Sudoku #324 | 0:38 ✏️` → `seconds:38` | default extractor |

> Avoid `RegExp.$1` (not lint-safe / not thread-safe under strict mode). Use a captured local `const mm = text.match(RE); const n = mm ? Number(mm[1]) : fallback;` — the code blocks below do exactly that.

- [ ] **Step 1: Write the failing tests (all 13, one `detail` block per file)**

Append the following to each parser's test file. Shared assertion pattern: `expect(parser.parse(SAMPLE).detail).toEqual(<exact shape>)` plus one `expect(...).value)` guard that the ranking scalar is unchanged.

`src/parsers/connections.test.ts`:
```ts
describe("connections detail", () => {
  it("captures mistakes, solvedAll, and the verbatim grid", () => {
    expect(connectionsParser.parse(SOLVED).detail).toEqual({
      mistakes: 2,
      solvedAll: true,
      grid: ["🟩🟦🟪🟪", "🟦🟨🟨🟨", "🟨🟨🟨🟨", "🟩🟩🟩🟩", "🟦🟦🟦🟦", "🟪🟪🟪🟪"],
    });
    expect(connectionsParser.parse(SOLVED).value).toBe(2);
  });
});
```

`src/parsers/strands.test.ts`:
```ts
describe("strands detail", () => {
  it("captures hints, theme, and the verbatim grid", () => {
    expect(strandsParser.parse(SAMPLE).detail).toEqual({
      hints: 0,
      theme: "Added flavor",
      grid: ["🔵🔵🔵🔵", "🔵🟡"],
    });
    expect(strandsParser.parse(SAMPLE).value).toBe(0);
  });
});
```

`src/parsers/pinpoint.test.ts`:
```ts
describe("pinpoint detail", () => {
  it("captures guesses, solved, and the %-match trail", () => {
    expect(pinpointParser.parse(SAMPLE).detail).toEqual({ guesses: 3, solved: true, trail: [33, 3, 100] });
    expect(pinpointParser.parse(SAMPLE).value).toBe(3);
  });
});
```

`src/parsers/minuteCryptic.test.ts`:
```ts
describe("minute cryptic detail", () => {
  it("captures hints and under-community-par", () => {
    expect(minuteCrypticParser.parse(SAMPLE).detail).toEqual({ hints: 0, underPar: 3 });
  });
});
```

`src/parsers/pips.test.ts`:
```ts
describe("pips detail", () => {
  it("captures seconds and difficulty", () => {
    expect(pipsParser.parse("Pips #317 Hard 🔴\n9:53").detail).toEqual({ seconds: 593, difficulty: "hard" });
  });
});
```

`src/parsers/indiaMini.test.ts`:
```ts
describe("india mini detail", () => {
  it("captures seconds", () => {
    expect(indiaMiniParser.parse(SAMPLE).detail).toEqual({ seconds: 320 });
  });
});
```

`src/parsers/linkedin.test.ts`:
```ts
describe("linkedin detail", () => {
  it("Queens/Tango/Mini Sudoku capture just seconds", () => {
    expect(queensParser.parse("Queens #792\n0:31 👑").detail).toEqual({ seconds: 31 });
    expect(tangoParser.parse("Tango #632\n0:23 🌗").detail).toEqual({ seconds: 23 });
    expect(miniSudokuParser.parse("Mini Sudoku #324 | 0:38 ✏️").detail).toEqual({ seconds: 38 });
  });
  it("Zip captures backtracks", () => {
    expect(zipParser.parse("Zip #472 | 0:12 🏁\nWith 1 backtrack 🛑\nlnkd.in/zip.").detail).toEqual({ seconds: 12, backtracks: 1 });
  });
  it("Crossclimb captures fill order", () => {
    expect(crossclimbParser.parse("Crossclimb #793 | 1:28\nFill order: 1️⃣ 2️⃣ 3️⃣\nlnkd.in/crossclimb.").detail).toEqual({ seconds: 88, fillOrder: [1, 2, 3] });
  });
  it("Patches captures hints and redraws", () => {
    expect(patchesParser.parse("Patches #107 | 0:19 🧶\nWith no hints & 1 redraw\nlnkd.in/patches.").detail).toEqual({ seconds: 19, hints: 0, redraws: 1 });
  });
  it("Wend captures hints", () => {
    expect(wendParser.parse("Wend #24 | 0:45 🌀\nWith no hints\nlnkd.in/wend.").detail).toEqual({ seconds: 45, hints: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/parsers/connections.test.ts src/parsers/strands.test.ts src/parsers/pinpoint.test.ts src/parsers/minuteCryptic.test.ts src/parsers/pips.test.ts src/parsers/indiaMini.test.ts src/parsers/linkedin.test.ts`
Expected: FAIL — every new `detail` assertion fails (detail undefined).

- [ ] **Step 3: Write the implementations**

`src/parsers/connections.ts` — replace the `return` block in `parse` with:
```ts
    const mono = rows.filter((r) => r.every((c) => c === r[0])).length;
    return {
      gameId: "connections",
      puzzleNumber: Number(p[1]),
      variant: null,
      value: rows.length - mono,
      solved: mono === 4,
      detail: {
        mistakes: rows.length - mono,
        solvedAll: mono === 4,
        grid: rows.map((r) => r.join("")),
      },
    };
```

`src/parsers/strands.ts` — replace `parse` body with:
```ts
  parse(text: string): ParseResult {
    const h = text.match(HEADER);
    if (!h) throw new Error("Not a Strands result");
    const hints = (text.match(HINT) ?? []).length;
    const theme = text.match(/"([^"]+)"/)?.[1] ?? null;
    const SQ = /[🔵🟡💡]/gu;
    const grid = text
      .split("\n")
      .map((line) => [...line.matchAll(SQ)].map((m) => m[0]))
      .filter((sq) => sq.length > 0)
      .map((sq) => sq.join(""));
    return {
      gameId: "strands",
      puzzleNumber: Number(h[1]),
      variant: null,
      value: hints,
      solved: true,
      detail: { hints, theme, grid },
    };
  },
```

`src/parsers/pinpoint.ts` — replace the `return` block with:
```ts
    const trail = [...text.matchAll(/(\d+)%\s*match/gi)].map((m) => Number(m[1]));
    const solved = /📌/u.test(text) || /100%/.test(text);
    return {
      gameId: "pinpoint",
      puzzleNumber: Number(h[1]),
      variant: null,
      value: Number(g[1]),
      solved,
      detail: { guesses: Number(g[1]), solved, trail },
    };
```

`src/parsers/minuteCryptic.ts` — replace `parse` body with:
```ts
  parse(text: string): ParseResult {
    if (!HEADER.test(text)) throw new Error("Not a Minute Cryptic result");
    const h = text.match(HINTS);
    const hints = h ? Number(h[1]) : 0;
    const up = text.match(/(\d+)\s+under the community par/i);
    return {
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: hints,
      solved: /🏆/u.test(text) || /solvers/i.test(text),
      detail: { hints, underPar: up ? Number(up[1]) : null },
    };
  },
```

`src/parsers/pips.ts` — replace the `return` block with:
```ts
    return {
      gameId: "pips",
      puzzleNumber: Number(h[1]),
      variant: h[2].toLowerCase(),
      value,
      solved: true,
      detail: { seconds: value, difficulty: h[2].toLowerCase() },
    };
```

`src/parsers/indiaMini.ts` — replace the `return` block with:
```ts
    return {
      gameId: "india-mini",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
    };
```

`src/parsers/linkedin.ts` — replace the whole file with:
```ts
import type { Parser, ParseResult, ResultDetail } from "./types";
import { parseClock } from "@/lib/time";

const CLOCK = /(\d+:\d{2})/;

// LinkedIn timed games share "<Name> #<n>" followed by an m:ss time.
// Each game may capture extra structured detail (backtracks/redraws/etc.);
// the default is just the raw seconds.
export function makeLinkedInTimedParser(
  gameId: string,
  displayName: string,
  extractDetail: (text: string, seconds: number) => ResultDetail = (_t, seconds) => ({ seconds }),
): Parser {
  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^${escaped}\\s+#(\\d+)`, "im");
  return {
    gameId,
    detect(text: string): boolean {
      return header.test(text);
    },
    parse(text: string): ParseResult {
      const h = text.match(header);
      if (!h) throw new Error(`Not a ${displayName} result`);
      const c = text.match(CLOCK);
      const value = c ? parseClock(c[1]) : null;
      if (value === null) throw new Error(`No valid ${displayName} time`);
      return {
        gameId,
        puzzleNumber: Number(h[1]),
        variant: null,
        value,
        solved: true,
        detail: extractDetail(text, value),
      };
    },
  };
}

export const queensParser = makeLinkedInTimedParser("queens", "Queens");
export const tangoParser = makeLinkedInTimedParser("tango", "Tango");
export const miniSudokuParser = makeLinkedInTimedParser("mini-sudoku", "Mini Sudoku");

export const zipParser = makeLinkedInTimedParser("zip", "Zip", (text, seconds) => {
  const b = text.match(/(\d+)\s+backtrack/i);
  return { seconds, backtracks: b ? Number(b[1]) : 0 };
});

export const crossclimbParser = makeLinkedInTimedParser("crossclimb", "Crossclimb", (text, seconds) => {
  const KEYCAP = /([0-9])️?⃣/gu;
  const fillOrder = [...text.matchAll(KEYCAP)].map((m) => Number(m[1]));
  return { seconds, fillOrder };
});

export const patchesParser = makeLinkedInTimedParser("patches", "Patches", (text, seconds) => {
  const noHints = /no hints/i.test(text);
  const h = text.match(/(\d+)\s+hints?/i);
  const r = text.match(/(\d+)\s+redraws?/i);
  return { seconds, hints: noHints ? 0 : h ? Number(h[1]) : 0, redraws: r ? Number(r[1]) : 0 };
});

export const wendParser = makeLinkedInTimedParser("wend", "Wend", (text, seconds) => {
  const noHints = /no hints/i.test(text);
  const h = text.match(/(\d+)\s+hints?/i);
  return { seconds, hints: noHints ? 0 : h ? Number(h[1]) : 0 };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/parsers/`
Expected: PASS (all parser tests, existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/connections.ts src/parsers/strands.ts src/parsers/pinpoint.ts src/parsers/minuteCryptic.ts src/parsers/pips.ts src/parsers/indiaMini.ts src/parsers/linkedin.ts src/parsers/*.test.ts
git commit -m "feat(parsers): emit structured detail across the remaining 13 parsers"
```

---

## Task 6: Add `entries.detail JSONB` column

**Files:**
- Modify: `src/db/schema.sql` (append)

**Interfaces:**
- Produces: nullable `entries.detail` JSONB column. Consumed by the entries write (Task 8), read routes (Tasks 9, 14), backfill (Task 7).

- [ ] **Step 1: Append the additive column (NO `;` inside comments)**

Append to `src/db/schema.sql`:
```sql
-- === Leaderboard redesign: structured per-result detail (display/analytics only) ===
-- Nullable. Populated by parsers on write and by scripts/backfill-detail.mjs for
-- existing rows. The ranking scalar parsed_value + solved are unchanged. Rows
-- that fail to re-parse keep detail = NULL and fall back to scalar display.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS detail JSONB;
```

- [ ] **Step 2: Verify the schema splits cleanly (no stray `;` in comments)**

Run: `node -e "const s=require('fs').readFileSync('src/db/schema.sql','utf8');const n=s.split(';').map(x=>x.trim()).filter(Boolean);console.log('statements:',n.length);console.log('last:',JSON.stringify(n[n.length-1]))"`
Expected: prints a statement count and the last statement is exactly `ALTER TABLE entries ADD COLUMN IF NOT EXISTS detail JSONB` (no comment text bleeding into it — confirms no `;` inside the comment block).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.sql
git commit -m "feat(db): add nullable entries.detail JSONB column"
```

> The actual migration against preview/prod is a Deploy gate (G1/G2), run by the controller — NOT a code step.

---

## Task 7: Backfill script — re-parse `raw_input` → `detail`

**Files:**
- Create: `src/lib/backfillDetailVerify.ts`
- Test: `src/lib/backfillDetailVerify.test.ts`
- Create: `scripts/backfill-detail.mjs`
- Modify: `package.json` (add `tsx` devDependency)

**Interfaces:**
- Consumes: `detectAndParse` (`src/parsers/registry.ts`).
- Produces: `summarizeDetailCoverage(input: DetailCoverageInput): DetailCoverageSummary` (pure, unit-tested); a runnable `--dry-run`/apply script.

> **Judgment call (flagged for controller):** re-parsing must use the REAL parsers (single source of truth — re-implementing 14 parsers in `.mjs` would be a DRY disaster and drift). Node v20 here cannot strip TS, so the script imports `src/parsers/registry.ts` and is run via `npx tsx scripts/backfill-detail.mjs` (tsx resolves the `@/*` tsconfig path used by `pips.ts`/`linkedin.ts`). This adds a dev-only `tsx` devDependency — the repo's prior backfill avoided TS scripts by mirroring a tiny pure fn, which is not viable for the full parser stack. The pure coverage/gating logic still lives in a unit-tested `src/lib` module, matching the phase-1 precedent. **Controller: confirm adding `tsx` is acceptable; alternatively run via `node --import tsx scripts/backfill-detail.mjs`.**

- [ ] **Step 1: Write the failing test**

Create `src/lib/backfillDetailVerify.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { summarizeDetailCoverage } from "./backfillDetailVerify";

describe("summarizeDetailCoverage", () => {
  it("computes fractional coverage of re-parsed rows", () => {
    expect(summarizeDetailCoverage({ total: 10, reparsed: 8, failed: 2 })).toEqual({
      total: 10,
      reparsed: 8,
      failed: 2,
      coverage: 0.8,
    });
  });
  it("treats an empty run as fully covered (nothing to backfill)", () => {
    expect(summarizeDetailCoverage({ total: 0, reparsed: 0, failed: 0 })).toEqual({
      total: 0,
      reparsed: 0,
      failed: 0,
      coverage: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/backfillDetailVerify.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the pure summary**

Create `src/lib/backfillDetailVerify.ts`:
```ts
/**
 * Pure coverage summary for scripts/backfill-detail.mjs. Kept in src/lib so the
 * dry-run gating (how much of raw_input we could re-parse into detail) is
 * unit-testable without a DB. The script imports this directly (via tsx).
 */
export interface DetailCoverageInput {
  total: number;
  reparsed: number;
  failed: number;
}

export interface DetailCoverageSummary extends DetailCoverageInput {
  /** reparsed / total, rounded to 2dp. 1 when there is nothing to backfill. */
  coverage: number;
}

export function summarizeDetailCoverage(input: DetailCoverageInput): DetailCoverageSummary {
  const coverage = input.total === 0 ? 1 : Math.round((input.reparsed / input.total) * 100) / 100;
  return { ...input, coverage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/backfillDetailVerify.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `tsx` as a devDependency**

Run: `npm install -D tsx`
Expected: `package.json` gains `tsx` under `devDependencies`; `package-lock.json` updates.

- [ ] **Step 6: Write the backfill script**

Create `scripts/backfill-detail.mjs`:
```js
// Re-parse existing entries.raw_input into entries.detail (display/analytics
// only; never touches parsed_value/solved). Idempotent: only touches rows
// where detail IS NULL. Best-effort — rows that fail to re-parse keep
// detail = NULL and fall back to scalar display (no data loss).
//
// Run with tsx so it can import the REAL parser registry (single source of
// truth). NOT run by CI/agents — a guided Deploy gate step:
//   set -a && . ./.env.local && set +a && npx tsx scripts/backfill-detail.mjs --dry-run
//   set -a && . ./.env.local && set +a && npx tsx scripts/backfill-detail.mjs
import { neon } from "@neondatabase/serverless";
import { detectAndParse } from "../src/parsers/registry";
import { summarizeDetailCoverage } from "../src/lib/backfillDetailVerify";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");

const rows = await sql`
  SELECT id, raw_input FROM entries
  WHERE detail IS NULL AND raw_input IS NOT NULL
`;

let reparsed = 0;
let failed = 0;
for (const r of rows) {
  const parsed = detectAndParse(r.raw_input);
  if (!parsed || !parsed.detail) {
    failed++;
    continue;
  }
  reparsed++;
  if (!dryRun) {
    await sql`UPDATE entries SET detail = ${JSON.stringify(parsed.detail)}::jsonb WHERE id = ${r.id}`;
  }
}

const summary = summarizeDetailCoverage({ total: rows.length, reparsed, failed });
console.log(dryRun ? "[dry-run]" : "[applied]", summary);
```

- [ ] **Step 7: Verify the script imports and runs without a DB (arg-parse smoke)**

Run: `npx tsx -e "import('./src/lib/backfillDetailVerify.ts').then(m=>console.log(m.summarizeDetailCoverage({total:2,reparsed:1,failed:1})))"`
Expected: prints `{ total: 2, reparsed: 1, failed: 1, coverage: 0.5 }` — confirms tsx runs and resolves TS. (The full DB run is Deploy gate G2, controller-run.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/backfillDetailVerify.ts src/lib/backfillDetailVerify.test.ts scripts/backfill-detail.mjs package.json package-lock.json
git commit -m "feat(backfill): re-parse raw_input into entries.detail (+ pure coverage summary)"
```

---

## Task 8: Persist `detail` on the write path

**Files:**
- Modify: `src/lib/submission.ts`
- Test: `src/lib/submission.test.ts` (append)
- Modify: `src/app/api/entries/route.ts`

**Interfaces:**
- Consumes: `ResultDetail` (Task 1), the `entries.detail` column (Task 6).
- Produces: `ResolvedSubmission.detail: ResultDetail | null`; the entries INSERT writes it.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/submission.test.ts`:
```ts
describe("resolveSubmission detail", () => {
  it("carries parser detail through in paste mode", () => {
    const detect = () => ({
      gameId: "wordle", puzzleNumber: 1, variant: null, value: 3, solved: true,
      detail: { guesses: 3, solved: true, hardMode: false, grid: ["🟩🟩🟩🟩🟩"] },
    });
    const r = resolveSubmission({ rawInput: "Wordle 1 3/6" }, detect);
    expect("detail" in r && r.detail).toEqual({ guesses: 3, solved: true, hardMode: false, grid: ["🟩🟩🟩🟩🟩"] });
  });
  it("sets detail null in manual mode", () => {
    const r = resolveSubmission({ gameId: "nyt-mini", value: 48, solved: true });
    expect("detail" in r && r.detail).toBeNull();
  });
});
```
(Ensure the file's top imports `resolveSubmission` — it already does.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/submission.test.ts -t "resolveSubmission detail"`
Expected: FAIL — `detail` missing on `ResolvedSubmission` / type error.

- [ ] **Step 3: Write the implementation**

In `src/lib/submission.ts`: add `detail` to the interface and both return paths.
```ts
import { detectAndParse } from "@/parsers/registry";
import type { ParseResult, ResultDetail } from "@/parsers/types";

export interface ResolvedSubmission {
  gameId: string;
  variant: string | null;
  value: number;
  solved: boolean;
  puzzleNumber: number | null;
  rawInput: string | null;
  detail: ResultDetail | null;
}
```
Paste-mode return: `return { ...parsed, rawInput: b.rawInput, detail: parsed.detail ?? null };`
Manual-mode return: add `detail: null,` to the returned object.

- [ ] **Step 4: Persist it in the entries route**

In `src/app/api/entries/route.ts` `supersedeAndInsert`, add `detail` to the INSERT column list and values:
```ts
      await sql`
        INSERT INTO entries (id, user_id, game_id, variant, puzzle_date, puzzle_number, raw_input, parsed_value, solved, is_late, version, detail)
        VALUES (${entryId}, ${userId}, ${resolved.gameId}, ${resolved.variant}, ${puzzleDate},
          ${resolved.puzzleNumber}, ${resolved.rawInput}, ${resolved.value}, ${resolved.solved}, false, ${version},
          ${resolved.detail === null ? null : JSON.stringify(resolved.detail)}::jsonb)
      `;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/submission.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS (route compiles with the new column).

- [ ] **Step 6: Commit**

```bash
git add src/lib/submission.ts src/lib/submission.test.ts src/app/api/entries/route.ts
git commit -m "feat(entries): persist structured detail on write"
```

---

## Task 9: Read `detail` on `/me`; client types; proper units on the You screen

**Files:**
- Modify: `src/app/api/me/route.ts`
- Modify: `src/scoring/me.ts` (thread `detail` into `recent`)
- Test: `src/scoring/me.test.ts` (append)
- Modify: `src/lib/api.ts` (add `ResultDetail`, extend `MeResponse.recent`)
- Modify: `src/app/(app)/you/page.tsx`
- Test: `src/components/you.test.tsx` (adjust recent-value assertions)

**Interfaces:**
- Consumes: `formatResult` (Task 3), `entries.detail` (Task 6).
- Produces: `MeResponse.recent[].detail: ResultDetail | null`; the You "Recent" list renders `formatResult(gameId, value, solved, detail)` instead of the raw number.

- [ ] **Step 1: Write the failing test (scoring/me threads detail)**

Append to `src/scoring/me.test.ts`:
```ts
it("passes detail through to the recent list", () => {
  const result = computeMe({
    today: "2026-07-06",
    games: [{ id: "wordle", name: "Wordle" }],
    entries: [
      { gameId: "wordle", variant: null, puzzleDate: "2026-07-06", value: 3, solved: true, direction: "lower_better", detail: { guesses: 3, solved: true, hardMode: false, grid: [] } },
    ],
  });
  expect(result.recent[0].detail).toEqual({ guesses: 3, solved: true, hardMode: false, grid: [] });
});
```
(The existing `me.test.ts` cases pass `entries` without `detail`; make `detail` optional on `MeEntry` so they still compile.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/me.test.ts -t "detail through"`
Expected: FAIL — `detail` absent on recent row / type error.

- [ ] **Step 3: Thread detail through `computeMe`**

In `src/scoring/me.ts`:
- Add `import type { ResultDetail } from "@/parsers/types";`
- `MeEntry`: add `detail?: ResultDetail | null;`
- `MeResult.recent[]`: add `detail: ResultDetail | null;`
- In the `recent` map, add `detail: e.detail ?? null,`.

- [ ] **Step 4: Select detail in the `/me` route**

In `src/app/api/me/route.ts`, add `e.detail` to BOTH entry SELECTs, widen the row cast with `detail: ResultDetail | null;` (import the type), and add `detail: e.detail ?? null` when mapping `entries`.

- [ ] **Step 5: Add client types**

In `src/lib/api.ts`:
- Add `export type { ResultDetail } from "@/parsers/types";`
- Extend `MeResponse.recent[]` with `detail: ResultDetail | null;`.

- [ ] **Step 6: Render proper units on You (implementation)**

In `src/app/(app)/you/page.tsx`:
- `import { formatResult } from "@/lib/formatResult";`
- Replace the recent value cell:
```tsx
                  <span className={styles.recentValue}>
                    {formatResult(r.gameId, r.value, r.solved, r.detail)}
                  </span>
```

- [ ] **Step 7: Update the You component test**

In `src/components/you.test.tsx`, the `meResponse.recent` fixtures now need `detail` (use `detail: null` — falls back to scalar-via-formatResult, which for wordle value 3 solved renders `3/6 ✓`). Update the recent fixtures to include `detail: null` and adjust the value expectation: the Wordle recent row now shows `3/6 ✓` (was `3`), the Pips Hard row shows `1:12` (was `72`), the Mini row shows `0:48` (was `48`). Add/adjust:
```ts
  recent: [
    { gameId: "wordle", name: "Wordle", variant: null, value: 3, solved: true, puzzleDate: today, detail: null },
    { gameId: "pips", name: "Pips", variant: "Hard", value: 72, solved: true, puzzleDate: today, detail: null },
    { gameId: "nyt-mini", name: "Mini", variant: null, value: 48, solved: true, puzzleDate: yesterday, detail: null },
  ],
```
And in the "renders recent history with relative days" test, keep the day assertions (unchanged); add `expect(screen.getByText("3/6 ✓")).toBeTruthy();` and `expect(screen.getByText("1:12")).toBeTruthy();`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/scoring/me.test.ts src/components/you.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/me/route.ts src/scoring/me.ts src/scoring/me.test.ts src/lib/api.ts src/app/(app)/you/page.tsx src/components/you.test.tsx
git commit -m "feat(you): read detail on /me and render results in proper units"
```

---

## Task 10: `tallyMedals` — placements with gold/silver/bronze (pure)

**Files:**
- Create: `src/scoring/medals.ts`
- Test: `src/scoring/medals.test.ts`

**Interfaces:**
- Consumes: `GameEntry`, `isBetter` from `src/scoring/wins.ts`.
- Produces:
  - `type Medal = "gold" | "silver" | "bronze"`
  - `interface MedalCounts { gold: number; silver: number; bronze: number }`
  - `interface MedalTally extends MedalCounts { playerId: string }`
  - `tallyMedals(entries: GameEntry[]): MedalTally[]` — per player, summed across every game+variant+puzzle group. Best (by direction) distinct value = 🥇 (co-winners all tie for gold); 2nd distinct value = 🥈; 3rd distinct = 🥉. Reuses the `tallyWins` grouping shape, extended to placements. Consumed by Tasks 11–13.

- [ ] **Step 1: Write the failing test**

Create `src/scoring/medals.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tallyMedals, type GameEntryLike } from "./medals";
import type { GameEntry } from "./wins";

const base = { gameId: "wordle", variant: null, puzzleKey: "wordle|1", direction: "lower_better" as const };

describe("tallyMedals", () => {
  it("awards gold to the best, silver/bronze to the next distinct values", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 2, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
      { ...base, playerId: "c", value: 4, solved: true },
    ];
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 1, silver: 0, bronze: 0 },
      { playerId: "b", gold: 0, silver: 1, bronze: 0 },
      { playerId: "c", gold: 0, silver: 0, bronze: 1 },
    ]);
  });

  it("co-winners at the best value all take gold (tie for first)", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 3, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
      { ...base, playerId: "c", value: 5, solved: true },
    ];
    // Two golds; next distinct value (5) is silver.
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 1, silver: 0, bronze: 0 },
      { playerId: "b", gold: 1, silver: 0, bronze: 0 },
      { playerId: "c", gold: 0, silver: 1, bronze: 0 },
    ]);
  });

  it("ignores unsolved entries and gives no medal past 3rd distinct value", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 1, solved: true },
      { ...base, playerId: "b", value: 2, solved: true },
      { ...base, playerId: "c", value: 3, solved: true },
      { ...base, playerId: "d", value: 4, solved: true },
      { ...base, playerId: "e", value: 9, solved: false },
    ];
    const byId = Object.fromEntries(tallyMedals(entries).map((m) => [m.playerId, m]));
    expect(byId.d).toEqual({ playerId: "d", gold: 0, silver: 0, bronze: 0 });
    expect(byId.e).toEqual({ playerId: "e", gold: 0, silver: 0, bronze: 0 });
  });

  it("respects higher_better direction", () => {
    const entries: GameEntry[] = [
      { ...base, direction: "higher_better", playerId: "a", value: 10, solved: true },
      { ...base, direction: "higher_better", playerId: "b", value: 20, solved: true },
    ];
    const byId = Object.fromEntries(tallyMedals(entries).map((m) => [m.playerId, m]));
    expect(byId.b.gold).toBe(1);
    expect(byId.a.silver).toBe(1);
  });

  it("sums medals across separate puzzles and sorts by gold, then silver, then bronze, then id", () => {
    const entries: GameEntry[] = [
      { ...base, playerId: "a", value: 2, solved: true },
      { ...base, playerId: "b", value: 3, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "b", value: 40, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "a", value: 55, solved: true },
    ];
    expect(tallyMedals(entries)).toEqual([
      { playerId: "a", gold: 1, silver: 1, bronze: 0 },
      { playerId: "b", gold: 1, silver: 1, bronze: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/medals.test.ts`
Expected: FAIL — cannot find module `./medals`.

- [ ] **Step 3: Write the implementation**

Create `src/scoring/medals.ts`:
```ts
import { isBetter, type GameEntry } from "./wins";

export type Medal = "gold" | "silver" | "bronze";

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface MedalTally extends MedalCounts {
  playerId: string;
}

// Re-exported for test ergonomics; tallyMedals consumes the same GameEntry
// shape the rest of the scoring layer uses.
export type GameEntryLike = GameEntry;

function groupKey(e: GameEntry): string {
  return `${e.gameId}|${e.variant ?? ""}|${e.puzzleKey}`;
}

const MEDAL_BY_RANK: (Medal | null)[] = ["gold", "silver", "bronze"];

/**
 * Placements per player, summed across every game+variant+puzzle group.
 * Among SOLVED entries in a group, distinct values are ranked by direction:
 * best distinct = gold (all co-winners tie for gold), 2nd distinct = silver,
 * 3rd distinct = bronze. Nothing past 3rd. PURE.
 */
export function tallyMedals(entries: GameEntry[]): MedalTally[] {
  const tally = new Map<string, MedalTally>();
  const ensure = (playerId: string): MedalTally => {
    let t = tally.get(playerId);
    if (!t) {
      t = { playerId, gold: 0, silver: 0, bronze: 0 };
      tally.set(playerId, t);
    }
    return t;
  };
  for (const e of entries) ensure(e.playerId);

  const groups = new Map<string, GameEntry[]>();
  for (const e of entries) {
    const key = groupKey(e);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(e);
  }

  for (const group of groups.values()) {
    const solved = group.filter((e) => e.solved);
    if (solved.length === 0) continue;
    const dir = solved[0].direction;
    const distinct = [...new Set(solved.map((e) => e.value))].sort((a, b) =>
      isBetter(a, b, dir) ? -1 : isBetter(b, a, dir) ? 1 : 0,
    );
    for (const e of solved) {
      const rank = distinct.indexOf(e.value);
      const medal = MEDAL_BY_RANK[rank];
      if (medal) ensure(e.playerId)[medal] += 1;
    }
  }

  return [...tally.values()].sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerId.localeCompare(b.playerId),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/medals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/medals.ts src/scoring/medals.test.ts
git commit -m "feat(scoring): tallyMedals placements (gold/silver/bronze, ties for gold)"
```

---

## Task 11: `computeMedalBoard` — aggregate per-game board (medals + played + PB)

**Files:**
- Modify: `src/scoring/medals.ts`
- Test: `src/scoring/medals.test.ts` (append)

**Interfaces:**
- Consumes: `tallyMedals` (Task 10), `DatedGameEntry` from `src/scoring/gameBoard.ts`, `isBetter` from `wins.ts`.
- Produces:
  - `interface MedalBoardStat extends MedalCounts { playerId: string; gamesPlayed: number; pb: number | null }`
  - `computeMedalBoard(entries: DatedGameEntry[], start: string | null): MedalBoardStat[]` — medals over the window, `gamesPlayed` = in-window entry count, `pb` = best (by direction) all-time solved value; sorted gold→silver→bronze→id; players with 0 in-window entries dropped. Consumed by the board route (Task 14).

- [ ] **Step 1: Write the failing test**

Append to `src/scoring/medals.test.ts`:
```ts
import { computeMedalBoard } from "./medals";
import type { DatedGameEntry } from "./gameBoard";

describe("computeMedalBoard", () => {
  const dg = (playerId: string, puzzleDate: string, value: number, solved = true): DatedGameEntry => ({
    playerId, gameId: "wordle", variant: null, puzzleKey: `wordle|${puzzleDate}`,
    value, solved, direction: "lower_better", puzzleDate,
  });

  it("ranks by medals over the window and reports played + all-time PB", () => {
    const entries: DatedGameEntry[] = [
      dg("a", "2026-07-05", 2), dg("b", "2026-07-05", 3),
      dg("a", "2026-07-06", 4), dg("b", "2026-07-06", 3),
      dg("a", "2026-06-01", 1), // out of window; still counts toward PB (all-time)
    ];
    const board = computeMedalBoard(entries, "2026-07-05");
    // 07-05: a=2 gold, b=3 silver. 07-06: b=3 gold, a=4 silver.
    // Both end gold:1 silver:1 bronze:0 → tie broken by playerId → a before b.
    expect(board.map((r) => r.playerId)).toEqual(["a", "b"]);
    const byId = Object.fromEntries(board.map((r) => [r.playerId, r]));
    expect(byId.b).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, pb: 3 });
    expect(byId.a).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, pb: 1 });
  });

  it("drops players with no in-window entries but PB stays all-time", () => {
    const entries: DatedGameEntry[] = [dg("a", "2026-06-01", 5)];
    expect(computeMedalBoard(entries, "2026-07-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/medals.test.ts -t computeMedalBoard`
Expected: FAIL — `computeMedalBoard` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/scoring/medals.ts`:
```ts
import { type DatedGameEntry } from "./gameBoard";

export interface MedalBoardStat extends MedalCounts {
  playerId: string;
  gamesPlayed: number;
  pb: number | null;
}

/**
 * Aggregate per-game board over a window: medals (window), gamesPlayed
 * (window), PB (best solved value ALL-TIME by direction). PURE.
 */
export function computeMedalBoard(entries: DatedGameEntry[], start: string | null): MedalBoardStat[] {
  const inWindow = (d: string) => start === null || d >= start;
  const windowed = entries.filter((e) => inWindow(e.puzzleDate));
  const medals = new Map(tallyMedals(windowed).map((m) => [m.playerId, m]));

  const byPlayer = new Map<string, DatedGameEntry[]>();
  for (const e of entries) {
    let g = byPlayer.get(e.playerId);
    if (!g) {
      g = [];
      byPlayer.set(e.playerId, g);
    }
    g.push(e);
  }

  const rows: MedalBoardStat[] = [];
  for (const [playerId, all] of byPlayer.entries()) {
    const win = all.filter((e) => inWindow(e.puzzleDate));
    if (win.length === 0) continue;
    let pb: number | null = null;
    for (const e of all) {
      if (!e.solved) continue;
      if (pb === null || isBetter(e.value, pb, e.direction)) pb = e.value;
    }
    const m = medals.get(playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    rows.push({ playerId, gold: m.gold, silver: m.silver, bronze: m.bronze, gamesPlayed: win.length, pb });
  }

  return rows.sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerId.localeCompare(b.playerId),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/medals.test.ts -t computeMedalBoard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/medals.ts src/scoring/medals.test.ts
git commit -m "feat(scoring): computeMedalBoard (aggregate medals + played + PB)"
```

---

## Task 12: `computeOverallMedals` — Overall medal tally across games (+ games led)

**Files:**
- Modify: `src/scoring/medals.ts`
- Test: `src/scoring/medals.test.ts` (append)

**Interfaces:**
- Consumes: `tallyMedals` (Task 10).
- Produces:
  - `interface OverallMedalStat extends MedalCounts { playerId: string; gamesPlayed: number; gamesLed: string[] }`
  - `computeOverallMedals(entries: GameEntry[]): OverallMedalStat[]` — total medals across ALL games; `gamesPlayed` = total entry count per player; `gamesLed` = the gameIds where the player has the most golds (>0) for that game (ties → all leaders list it). Sorted gold→silver→bronze→id. Consumed by the leaderboard route (Task 15).

- [ ] **Step 1: Write the failing test**

Append to `src/scoring/medals.test.ts`:
```ts
import { computeOverallMedals } from "./medals";

describe("computeOverallMedals", () => {
  it("sums medals across games, counts played, and lists games led", () => {
    const entries: GameEntry[] = [
      { gameId: "wordle", variant: null, puzzleKey: "wordle|1", direction: "lower_better", playerId: "a", value: 2, solved: true },
      { gameId: "wordle", variant: null, puzzleKey: "wordle|1", direction: "lower_better", playerId: "b", value: 3, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "b", value: 40, solved: true },
      { gameId: "mini", variant: null, puzzleKey: "mini|1", direction: "lower_better", playerId: "a", value: 55, solved: true },
    ];
    const byId = Object.fromEntries(computeOverallMedals(entries).map((r) => [r.playerId, r]));
    expect(byId.a).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, gamesLed: ["wordle"] });
    expect(byId.b).toMatchObject({ gold: 1, silver: 1, gamesPlayed: 2, gamesLed: ["mini"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/medals.test.ts -t computeOverallMedals`
Expected: FAIL — not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/scoring/medals.ts`:
```ts
export interface OverallMedalStat extends MedalCounts {
  playerId: string;
  gamesPlayed: number;
  gamesLed: string[];
}

/**
 * Overall medal tally across ALL games. gamesLed = the games where this player
 * has the most golds (>0). PURE.
 */
export function computeOverallMedals(entries: GameEntry[]): OverallMedalStat[] {
  const totals = new Map(tallyMedals(entries).map((m) => [m.playerId, m]));

  const played = new Map<string, number>();
  for (const e of entries) played.set(e.playerId, (played.get(e.playerId) ?? 0) + 1);

  // Gold leaders per game.
  const byGame = new Map<string, GameEntry[]>();
  for (const e of entries) {
    let g = byGame.get(e.gameId);
    if (!g) {
      g = [];
      byGame.set(e.gameId, g);
    }
    g.push(e);
  }
  const gamesLed = new Map<string, string[]>();
  for (const [gameId, gameEntries] of byGame.entries()) {
    const golds = tallyMedals(gameEntries);
    const maxGold = golds.reduce((mx, m) => Math.max(mx, m.gold), 0);
    if (maxGold === 0) continue;
    for (const m of golds) {
      if (m.gold === maxGold) {
        const list = gamesLed.get(m.playerId) ?? [];
        list.push(gameId);
        gamesLed.set(m.playerId, list);
      }
    }
  }

  const rows: OverallMedalStat[] = [...played.entries()].map(([playerId, gamesPlayed]) => {
    const m = totals.get(playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    return {
      playerId,
      gold: m.gold,
      silver: m.silver,
      bronze: m.bronze,
      gamesPlayed,
      gamesLed: (gamesLed.get(playerId) ?? []).sort(),
    };
  });

  return rows.sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerId.localeCompare(b.playerId),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/medals.test.ts -t computeOverallMedals`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/medals.ts src/scoring/medals.test.ts
git commit -m "feat(scoring): computeOverallMedals (cross-game tally + games led)"
```

---

## Task 13: `computeDailyContest` — today's live contest (one game, one day)

**Files:**
- Modify: `src/scoring/medals.ts`
- Test: `src/scoring/medals.test.ts` (append)

**Interfaces:**
- Consumes: `isBetter`, `GameEntry` from `wins.ts`; `Medal` (Task 10).
- Produces:
  - `interface DailyContestStat { playerId: string; value: number; solved: boolean; medal: Medal | null }`
  - `computeDailyContest(entries: GameEntry[]): DailyContestStat[]` — solved entries ranked by direction first (unsolved after, keyed by id), medal by distinct-value rank among solved (gold/silver/bronze). Assumes entries are already for one game + one day (the route filters). Consumed by the board route daily branch (Task 14).

- [ ] **Step 1: Write the failing test**

Append to `src/scoring/medals.test.ts`:
```ts
import { computeDailyContest } from "./medals";

describe("computeDailyContest", () => {
  const e = (playerId: string, value: number, solved = true): GameEntry => ({
    playerId, gameId: "wordle", variant: null, puzzleKey: "wordle|2026-07-06",
    value, solved, direction: "lower_better",
  });

  it("ranks solved by direction, medals the top three distinct, unsolved last", () => {
    const rows = computeDailyContest([e("a", 4), e("b", 2), e("c", 3), e("d", 9, false)]);
    expect(rows.map((r) => r.playerId)).toEqual(["b", "c", "a", "d"]);
    expect(rows.map((r) => r.medal)).toEqual(["gold", "silver", "bronze", null]);
  });

  it("co-winners tie for gold; the next distinct value is silver", () => {
    const rows = computeDailyContest([e("a", 3), e("b", 3), e("c", 5)]);
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId.a.medal).toBe("gold");
    expect(byId.b.medal).toBe("gold");
    expect(byId.c.medal).toBe("silver");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/medals.test.ts -t computeDailyContest`
Expected: FAIL — not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/scoring/medals.ts`:
```ts
export interface DailyContestStat {
  playerId: string;
  value: number;
  solved: boolean;
  medal: Medal | null;
}

/**
 * Today's live contest for a single game/day. Solved entries ranked by
 * direction; unsolved sink to the bottom (by playerId). Medal by distinct-value
 * rank among solved (gold/silver/bronze; co-winners tie for gold). PURE.
 */
export function computeDailyContest(entries: GameEntry[]): DailyContestStat[] {
  const solved = entries.filter((e) => e.solved);
  const unsolved = entries.filter((e) => !e.solved);
  const dir = entries[0]?.direction ?? "lower_better";
  const distinct = [...new Set(solved.map((e) => e.value))].sort((a, b) =>
    isBetter(a, b, dir) ? -1 : isBetter(b, a, dir) ? 1 : 0,
  );

  const solvedRows: DailyContestStat[] = solved
    .slice()
    .sort((a, b) => (isBetter(a.value, b.value, dir) ? -1 : isBetter(b.value, a.value, dir) ? 1 : a.playerId.localeCompare(b.playerId)))
    .map((e) => ({
      playerId: e.playerId,
      value: e.value,
      solved: true,
      medal: MEDAL_BY_RANK[distinct.indexOf(e.value)] ?? null,
    }));

  const unsolvedRows: DailyContestStat[] = unsolved
    .slice()
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map((e) => ({ playerId: e.playerId, value: e.value, solved: false, medal: null }));

  return [...solvedRows, ...unsolvedRows];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/medals.test.ts`
Expected: PASS (whole medals suite).

- [ ] **Step 5: Commit**

```bash
git add src/scoring/medals.ts src/scoring/medals.test.ts
git commit -m "feat(scoring): computeDailyContest (today live contest + medals)"
```

---

## Task 14: Board route — daily contest vs aggregate medal tally (+ detail, mode)

**Files:**
- Modify: `src/app/api/games/[gameId]/board/route.ts`
- Modify: `src/lib/api.ts` (board response types + `getBoard` return)
- Test: `src/lib/api.test.ts` is a client-shape test — no route runtime test here; the route is covered by the component test in Task 16 (mocked) + `npm run typecheck`.

**Interfaces:**
- Consumes: `computeDailyContest` (Task 13), `computeMedalBoard` (Task 11), `formatResult` (Task 3), `entries.detail` (Task 6), `windowStart` + `isDailyBoardLocked` (existing).
- Produces the board response (discriminated by `mode`):
  - `interface MedalBoardRow extends MedalCounts { displayName: string; gamesPlayed: number; pb: number | null; pbFormatted: string | null }`
  - `interface DailyContestRow { displayName: string; value: number; valueFormatted: string; solved: boolean; medal: Medal | null; detail: ResultDetail | null }`
  - `getBoard(...) => ApiResult<{ gameId; window: string; mode: "daily" | "aggregate"; locked: boolean; players: DailyContestRow[] | MedalBoardRow[]; viewerName: string | null }>`

- [ ] **Step 1: Add the client types (write the shape first)**

In `src/lib/api.ts`:
- Add `export type Medal = "gold" | "silver" | "bronze";`
- Add `export interface MedalCounts { gold: number; silver: number; bronze: number }`
- Replace `GameBoardRow` with:
```ts
export interface MedalBoardRow extends MedalCounts {
  displayName: string;
  gamesPlayed: number;
  pb: number | null;
  pbFormatted: string | null;
}

export interface DailyContestRow {
  displayName: string;
  value: number;
  valueFormatted: string;
  solved: boolean;
  medal: Medal | null;
  detail: ResultDetail | null;
}
```
- Change `getBoard`'s return type to:
```ts
): Promise<
  ApiResult<{
    gameId: string;
    window: string;
    mode: "daily" | "aggregate";
    locked: boolean;
    players: DailyContestRow[] | MedalBoardRow[];
    viewerName: string | null;
  }>
> {
```

- [ ] **Step 2: Run typecheck to verify old references break (expected failing state)**

Run: `npm run typecheck`
Expected: FAIL — `src/app/(app)/standings/page.tsx` and its test still reference the old `GameBoardRow`/response shape. (These are fixed in Task 16; this confirms the shape changed.)

- [ ] **Step 3: Rewrite the board route**

Replace the body of `src/app/api/games/[gameId]/board/route.ts` after the no-peek block. Add `import { formatResult } from "@/lib/formatResult";`, `import { computeDailyContest, computeMedalBoard, type Medal } from "@/scoring/medals";`, `import type { ResultDetail } from "@/parsers/types";`, keep `import { windowStart, type Window } from "@/lib/window";` (drop the now-unused `computeGameBoard`/`DatedGameEntry` import only if unused — `computeMedalBoard` needs `DatedGameEntry` from `@/scoring/gameBoard`, so keep that import). Add `e.detail` to BOTH SELECTs and widen the row cast with `detail: ResultDetail | null;`. Then replace the final mapping/return:
```ts
  const names = new Map(rows.map((r) => [r.user_id, r.display_name]));
  const detailById = new Map(rows.map((r) => [`${r.user_id}|${r.puzzle_date}`, r.detail ?? null]));

  if (window === "daily") {
    // Live contest: today's single puzzle for this game.
    const todays = rows.filter((r) => r.puzzle_date === today);
    const contestEntries = todays.map((r) => ({
      playerId: r.user_id,
      gameId,
      variant: r.variant,
      puzzleKey: `${gameId}|${r.puzzle_date}`,
      value: r.parsed_value,
      solved: r.solved,
      direction: r.metric_direction,
    }));
    const players = computeDailyContest(contestEntries).map((s) => ({
      displayName: names.get(s.playerId) ?? s.playerId,
      value: s.value,
      valueFormatted: formatResult(gameId, s.value, s.solved, detailById.get(`${s.playerId}|${today}`) ?? null),
      solved: s.solved,
      medal: s.medal as Medal | null,
      detail: detailById.get(`${s.playerId}|${today}`) ?? null,
    }));
    return NextResponse.json({ gameId, window, mode: "daily", locked: false, players, viewerName });
  }

  const datedEntries = rows.map((r) => ({
    playerId: r.user_id,
    gameId,
    variant: r.variant,
    puzzleKey: `${gameId}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
    puzzleDate: r.puzzle_date,
  }));
  const players = computeMedalBoard(datedEntries, start).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    gold: s.gold,
    silver: s.silver,
    bronze: s.bronze,
    gamesPlayed: s.gamesPlayed,
    pb: s.pb,
    pbFormatted: s.pb === null ? null : formatResult(gameId, s.pb, true, null),
  }));
  return NextResponse.json({ gameId, window, mode: "aggregate", locked: false, players, viewerName });
```
(Keep the existing locked-early-return; it already returns `{ locked: true, players: [] }` — add `mode: "daily"` to that response for shape consistency: `return NextResponse.json({ gameId, window, mode: "daily", locked: true, players: [], viewerName });`.)

- [ ] **Step 4: Typecheck the route in isolation**

Run: `npm run typecheck`
Expected: still FAIL only in `standings/page.tsx` + its test (Task 16). The route file itself must have no errors — confirm the route path is NOT in the error list.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/games/[gameId]/board/route.ts src/lib/api.ts
git commit -m "feat(board): daily live contest vs aggregate medal tally, with detail"
```

---

## Task 15: Leaderboard route — Overall medal tally

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`
- Modify: `src/lib/api.ts` (`OverallRow`, `getLeaderboard` return)
- Modify: `src/lib/leaderboardSort.ts` → `sortByMedals`
- Test: `src/lib/leaderboardSort.test.ts` (rewrite)

**Interfaces:**
- Consumes: `computeOverallMedals` (Task 12).
- Produces:
  - `OverallRow` reshaped to `extends MedalCounts { displayName: string; gamesPlayed: number; gamesLed: string[] }`
  - `sortByMedals(rows: OverallRow[]): OverallRow[]` (replaces `sortPlayers`/`LeaderboardSortKey`)
  - `getLeaderboard(...)` return `players: OverallRow[]` (medal-shaped). Consumed by Home/You/Standings (Tasks 16, 17).

- [ ] **Step 1: Write the failing test (sort by medals)**

Replace `src/lib/leaderboardSort.test.ts` with:
```ts
import { describe, it, expect } from "vitest";
import { sortByMedals } from "./leaderboardSort";
import type { OverallRow } from "./api";

const row = (displayName: string, gold: number, silver: number, bronze: number): OverallRow => ({
  displayName, gold, silver, bronze, gamesPlayed: gold + silver + bronze, gamesLed: [],
});

describe("sortByMedals", () => {
  it("sorts by gold, then silver, then bronze, then name; pure (no mutation)", () => {
    const input = [row("Zed", 1, 0, 0), row("Amy", 2, 0, 0), row("Bob", 1, 1, 0), row("Cara", 1, 0, 5)];
    const sorted = sortByMedals(input);
    expect(sorted.map((r) => r.displayName)).toEqual(["Amy", "Bob", "Cara", "Zed"]);
    expect(input[0].displayName).toBe("Zed"); // input unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/leaderboardSort.test.ts`
Expected: FAIL — `sortByMedals` not exported / `OverallRow` shape mismatch.

- [ ] **Step 3: Reshape `OverallRow` and write `sortByMedals`**

In `src/lib/api.ts` replace `OverallRow`:
```ts
export interface OverallRow extends MedalCounts {
  displayName: string;
  gamesPlayed: number;
  gamesLed: string[];
}
```
Replace `src/lib/leaderboardSort.ts` with:
```ts
import type { OverallRow } from "./api";

/**
 * Overall medal-tally order: gold, then silver, then bronze, then name.
 * Pure: does not mutate the input.
 */
export function sortByMedals(rows: OverallRow[]): OverallRow[] {
  return [...rows].sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.displayName.localeCompare(b.displayName),
  );
}
```

- [ ] **Step 4: Rewrite the leaderboard route mapping**

In `src/app/api/leaderboard/route.ts`: swap `import { computeOverall } from "@/scoring/leaderboard";` for `import { computeOverallMedals } from "@/scoring/medals";`. Replace the final `players`/return:
```ts
  const players = computeOverallMedals(gameEntries).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    gold: s.gold,
    silver: s.silver,
    bronze: s.bronze,
    gamesPlayed: s.gamesPlayed,
    gamesLed: s.gamesLed, // gameIds; the client maps ids→names via its games catalog
  }));
  return NextResponse.json({ window, locked, players, viewerName: guard.viewer.displayName ?? null });
```

- [ ] **Step 5: Update `getLeaderboard` return type**

In `src/lib/api.ts`, `getLeaderboard` already returns `players: OverallRow[]` — no signature change needed now that `OverallRow` is medal-shaped. Confirm the `Promise<ApiResult<{ window; locked; players: OverallRow[]; viewerName }>>` still reads correctly.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/leaderboardSort.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: FAIL only in `standings/page.tsx`, `page.tsx` (Home), `you/page.tsx`?, `LeaderboardTable.tsx`, and their tests — all fixed in Tasks 16–17. Route + lib compile.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/leaderboard/route.ts src/lib/api.ts src/lib/leaderboardSort.ts src/lib/leaderboardSort.test.ts
git commit -m "feat(leaderboard): Overall as a medal tally (+ sortByMedals)"
```

---

## Task 16: Board screen — one control row (Game ▾ + Window ▾) + medal/contest tables

**Files:**
- Create: `src/components/GameWindowNav.tsx`
- Create: `src/components/GameWindowNav.module.css` (reuse `Menu` primitive for the dropdown panels)
- Create: `src/components/MedalBoardTable.tsx`
- Create: `src/components/DailyContestTable.tsx` (flat here; Task 18 adds expansion)
- Modify: `src/app/(app)/standings/page.tsx`
- Test: `src/components/standings.test.tsx` (new — replaces reliance on the old inline table)

**Interfaces:**
- Consumes: `getGames`, `getBoard`, `getLeaderboard` (`api.ts`); `Game`, `OverallRow`, `MedalBoardRow`, `DailyContestRow` (Task 14/15); `useBoard`; `Menu`/`MenuItem` (`src/components/Menu.tsx`); `formatResult` not needed here (route pre-formats `valueFormatted`/`pbFormatted`).
- Produces:
  - `GameWindowNav` props: `{ games: Game[]; gameKey: string; onGameChange(key: string): void; windowKey: string; onWindowChange(key: string): void }` where `gameKey` is `"overall"` or a gameId; window keys are the existing `"daily"|"weekly"|"monthly"|"all"` shown as `Today/This week/This month/All-time`.
  - `MedalBoardTable` props: `{ rows: MedalBoardRow[]; me?: string }`
  - `DailyContestTable` props: `{ rows: DailyContestRow[]; me?: string }`

**Design (binding — keep it simple):** ONE row: `[ Game ▾ ] [ Window ▾ ]`. Game ▾ lists `Overall` + every game; Window ▾ lists the four windows. No chip strip, no segmented control. The group switcher stays in the top bar (unchanged). Collapsed rows are minimal: `rank · name · medals-or-value`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/standings.test.tsx`:
```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import Standings from "@/app/(app)/standings/page";
import { getGames, getLeaderboard, getBoard } from "@/lib/api";
import type { Game, OverallRow, MedalBoardRow, DailyContestRow } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getGames: vi.fn(), getLeaderboard: vi.fn(), getBoard: vi.fn() }));
vi.mock("@/components/BoardContext", () => ({ useBoard: () => ({ boardId: null }) }));

const g = vi.mocked(getGames);
const lb = vi.mocked(getLeaderboard);
const bd = vi.mocked(getBoard);

const games: Game[] = [{ id: "wordle", name: "Wordle", type: "outcome", metricDirection: "lower_better", hasVariants: false }];
const overall: OverallRow[] = [{ displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 10, gamesLed: ["wordle"] }];
const medalRows: MedalBoardRow[] = [{ displayName: "DJ", gold: 2, silver: 0, bronze: 1, gamesPlayed: 5, pb: 2, pbFormatted: "2/6 ✓" }];
const contestRows: DailyContestRow[] = [
  { displayName: "DJ", value: 2, valueFormatted: "2/6 ✓", solved: true, medal: "gold", detail: null },
];

beforeEach(() => {
  g.mockReset(); lb.mockReset(); bd.mockReset();
  g.mockResolvedValue({ ok: true, data: { games } });
  lb.mockResolvedValue({ ok: true, data: { window: "weekly", locked: false, players: overall, viewerName: "DJ" } });
});
afterEach(() => cleanup());

describe("Standings board screen", () => {
  it("shows Overall medal tally by default", async () => {
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));
    // Overall shows gold/silver/bronze counts
    expect(screen.getByText(/🥇/)).toBeTruthy();
  });

  it("switching Game ▾ to a game + Today shows the daily contest with proper units and a medal", async () => {
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "daily", mode: "daily", locked: false, players: contestRows, viewerName: "DJ" } });
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));
    fireEvent.click(screen.getByRole("button", { name: /window/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Today$/ }));

    await waitFor(() => expect(screen.getByText("2/6 ✓")).toBeTruthy());
    expect(screen.getByText(/🥇/)).toBeTruthy();
  });

  it("an aggregate window shows a flat medal board (no expandable rows) with PB in units", async () => {
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "weekly", mode: "aggregate", locked: false, players: medalRows, viewerName: "DJ" } });
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));

    await waitFor(() => expect(screen.getByText("2/6 ✓")).toBeTruthy()); // PB formatted
    // No expand chevrons on aggregate rows
    expect(screen.queryByRole("button", { name: /expand|details/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/standings.test.tsx`
Expected: FAIL — components/page not reshaped yet.

- [ ] **Step 3: Write `GameWindowNav`**

Create `src/components/GameWindowNav.tsx`:
```tsx
"use client";
import React, { useState } from "react";
import type { Game } from "@/lib/api";
import { Menu, MenuItem } from "@/components/Menu";
import { ChevronDown } from "@/design/icons";
import styles from "./GameWindowNav.module.css";

const WINDOW_LABELS: { k: string; label: string }[] = [
  { k: "daily", label: "Today" },
  { k: "weekly", label: "This week" },
  { k: "monthly", label: "This month" },
  { k: "all", label: "All-time" },
];

export interface GameWindowNavProps {
  games: Game[];
  gameKey: string; // "overall" | gameId
  onGameChange: (key: string) => void;
  windowKey: string;
  onWindowChange: (key: string) => void;
}

export function GameWindowNav({ games, gameKey, onGameChange, windowKey, onWindowChange }: GameWindowNavProps): JSX.Element {
  const [gameOpen, setGameOpen] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);
  const gameLabel = gameKey === "overall" ? "Overall" : games.find((x) => x.id === gameKey)?.name ?? "Overall";
  const windowLabel = WINDOW_LABELS.find((w) => w.k === windowKey)?.label ?? "This week";

  return (
    <div className={styles.row}>
      <button type="button" className={styles.control} aria-label="Game" onClick={() => setGameOpen(true)}>
        {gameLabel} <ChevronDown size={16} />
      </button>
      <button type="button" className={styles.control} aria-label="Window" onClick={() => setWindowOpen(true)}>
        {windowLabel} <ChevronDown size={16} />
      </button>

      <Menu open={gameOpen} onClose={() => setGameOpen(false)} title="Game">
        <MenuItem onClick={() => { onGameChange("overall"); setGameOpen(false); }}>Overall</MenuItem>
        {games.map((game) => (
          <MenuItem key={game.id} onClick={() => { onGameChange(game.id); setGameOpen(false); }}>
            {game.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu open={windowOpen} onClose={() => setWindowOpen(false)} title="Window">
        {WINDOW_LABELS.map((w) => (
          <MenuItem key={w.k} onClick={() => { onWindowChange(w.k); setWindowOpen(false); }}>
            {w.label}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
```
Create `src/components/GameWindowNav.module.css`:
```css
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border, #d0d0d0);
  border-radius: 10px;
  background: var(--surface, #fff);
  color: var(--text, #111);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 4: Write `MedalBoardTable` and `DailyContestTable`**

Create `src/components/MedalBoardTable.tsx`:
```tsx
import React from "react";
import type { MedalBoardRow } from "@/lib/api";
import styles from "@/app/(app)/standings/page.module.css";

export interface MedalBoardTableProps {
  rows: MedalBoardRow[];
  me?: string;
}

export function MedalBoardTable({ rows, me }: MedalBoardTableProps): JSX.Element {
  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={styles.boardHeaderCell}>Medals</th>
          <th className={styles.boardHeaderCell}>PB</th>
          <th className={styles.boardHeaderCell}>Played</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.displayName}
            className={[styles.boardRow, row.displayName === me ? styles.me : ""].filter(Boolean).join(" ")}
          >
            <td className={styles.rankCell}>{index + 1}</td>
            <td className={styles.nameCell}>{row.displayName}</td>
            <td className={styles.statCell}>
              🥇{row.gold} 🥈{row.silver} 🥉{row.bronze}
            </td>
            <td className={styles.statCell}>{row.pbFormatted ?? "—"}</td>
            <td className={styles.statCell}>{row.gamesPlayed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```
Create `src/components/DailyContestTable.tsx` (flat for now; Task 18 makes rows expandable):
```tsx
import React from "react";
import type { DailyContestRow } from "@/lib/api";
import styles from "@/app/(app)/standings/page.module.css";

const MEDAL_EMOJI: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };

export interface DailyContestTableProps {
  rows: DailyContestRow[];
  me?: string;
}

export function DailyContestTable({ rows, me }: DailyContestTableProps): JSX.Element {
  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={styles.boardHeaderCell}>Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.displayName}
            className={[styles.boardRow, row.displayName === me ? styles.me : ""].filter(Boolean).join(" ")}
          >
            <td className={styles.rankCell}>{index + 1}</td>
            <td className={styles.nameCell}>{row.displayName}</td>
            <td className={styles.statCell}>
              {row.medal ? `${MEDAL_EMOJI[row.medal]} ` : ""}
              {row.valueFormatted}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Rewrite the Standings page to use the one control row**

Replace `src/app/(app)/standings/page.tsx` with:
```tsx
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboard, getBoard, getGames } from "@/lib/api";
import type { OverallRow, MedalBoardRow, DailyContestRow, Game } from "@/lib/api";
import { useBoard } from "@/components/BoardContext";
import { sortByMedals } from "@/lib/leaderboardSort";
import { Card } from "@/components/Card";
import { GameWindowNav } from "@/components/GameWindowNav";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { MedalBoardTable } from "@/components/MedalBoardTable";
import { DailyContestTable } from "@/components/DailyContestTable";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LockedState } from "@/components/LockedState";
import styles from "./page.module.css";

type OverallState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; locked: boolean; rows: OverallRow[] };

type BoardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; locked: boolean; mode: "daily" | "aggregate"; rows: DailyContestRow[] | MedalBoardRow[] };

export default function Standings(): JSX.Element {
  const { boardId } = useBoard();
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState<string>("overall");
  const [windowKey, setWindowKey] = useState<string>("weekly");
  const [games, setGames] = useState<Game[]>([]);
  const [overall, setOverall] = useState<OverallState>({ status: "loading" });
  const [board, setBoard] = useState<BoardState>({ status: "idle" });
  const first = useRef(true);

  const loadGames = useCallback(() => {
    getGames(boardId ?? undefined).then((r) => {
      if (r.ok) setGames(r.data.games);
    });
  }, [boardId]);

  const loadOverall = useCallback((win: string) => {
    setOverall({ status: "loading" });
    getLeaderboard(win, undefined, boardId ?? undefined).then((r) => {
      if (!r.ok) return setOverall({ status: "error", message: r.error });
      setOverall({ status: "ready", locked: r.data.locked, rows: r.data.players });
      setViewerName(r.data.viewerName);
    });
  }, [boardId]);

  const loadBoard = useCallback((game: string, win: string) => {
    setBoard({ status: "loading" });
    getBoard(game, win, undefined, boardId ?? undefined).then((r) => {
      if (!r.ok) return setBoard({ status: "error", message: r.error });
      setBoard({ status: "ready", locked: r.data.locked, mode: r.data.mode, rows: r.data.players });
      setViewerName(r.data.viewerName);
    });
  }, [boardId]);

  useEffect(() => {
    if (!first.current) {
      setGameKey("overall");
      setBoard({ status: "idle" });
    }
    first.current = false;
    loadGames();
    loadOverall(windowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (gameKey === "overall") loadOverall(windowKey);
    else loadBoard(gameKey, windowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, windowKey]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Board</h1>

      <GameWindowNav
        games={games}
        gameKey={gameKey}
        onGameChange={setGameKey}
        windowKey={windowKey}
        onWindowChange={setWindowKey}
      />

      <Card>
        {gameKey === "overall" ? (
          <>
            {overall.status === "loading" && <div className={styles.skeletonRows}><Skeleton h={20} /><Skeleton h={20} /></div>}
            {overall.status === "error" && <ErrorState message={overall.message} onRetry={() => loadOverall(windowKey)} />}
            {overall.status === "ready" && overall.locked && (
              <LockedState><p>Log today&apos;s puzzle to reveal today&apos;s standings.</p></LockedState>
            )}
            {overall.status === "ready" && !overall.locked && overall.rows.length === 0 && (
              <EmptyState title="No standings yet" body="Once results are logged, the medal tally shows up here." />
            )}
            {overall.status === "ready" && !overall.locked && overall.rows.length > 0 && (
              <LeaderboardTable rows={sortByMedals(overall.rows)} me={viewerName ?? undefined} />
            )}
          </>
        ) : (
          <>
            {(board.status === "idle" || board.status === "loading") && (
              <div className={styles.skeletonRows}><Skeleton h={20} /><Skeleton h={20} /></div>
            )}
            {board.status === "error" && <ErrorState message={board.message} onRetry={() => loadBoard(gameKey, windowKey)} />}
            {board.status === "ready" && board.locked && (
              <LockedState><p>Log today&apos;s puzzle to reveal today&apos;s standings.</p></LockedState>
            )}
            {board.status === "ready" && !board.locked && board.rows.length === 0 && (
              <EmptyState title="No results yet" body="Once this game has results, the board shows up here." />
            )}
            {board.status === "ready" && !board.locked && board.rows.length > 0 && board.mode === "daily" && (
              <DailyContestTable rows={board.rows as DailyContestRow[]} me={viewerName ?? undefined} />
            )}
            {board.status === "ready" && !board.locked && board.rows.length > 0 && board.mode === "aggregate" && (
              <MedalBoardTable rows={board.rows as MedalBoardRow[]} me={viewerName ?? undefined} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
```
(The old inline `GameBoardTable` is removed; `Segmented`/`Chip` imports are dropped. `LeaderboardTable` is updated in Task 17 to take medal-shaped `OverallRow` + drop the sort props — this file passes only `rows`/`me`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/standings.test.tsx`
Expected: PASS (after Task 17's LeaderboardTable change; if run before Task 17, the Overall assertion may fail — run Task 17 then re-run. To keep this task self-contained, do Step 5 of Task 17's LeaderboardTable change now if needed, or run Task 16 + 17 as a pair before asserting green.)

> **Ordering note:** Tasks 16 and 17 both depend on the new `OverallRow`/`LeaderboardTable`. Implement Task 17's `LeaderboardTable` change first if the reviewer wants each task independently green; otherwise treat 16+17 as one review unit.

- [ ] **Step 7: Commit**

```bash
git add src/components/GameWindowNav.tsx src/components/GameWindowNav.module.css src/components/MedalBoardTable.tsx src/components/DailyContestTable.tsx src/app/(app)/standings/page.tsx src/components/standings.test.tsx
git commit -m "feat(board): one-row Game/Window nav + medal board + daily contest tables"
```

---

## Task 17: Overall medal columns in `LeaderboardTable`; wire Home + You

**Files:**
- Modify: `src/components/LeaderboardTable.tsx`
- Test: `src/components/leaderboardTable.test.tsx` (new or existing — assert medal columns + games-led sub-line)
- Modify: `src/app/(app)/page.tsx` (Home)
- Modify: `src/app/(app)/you/page.tsx` (rank/wins now from medals)
- Test: `src/components/you.test.tsx` (adjust to medal-shaped `OverallRow`)

**Interfaces:**
- Consumes: medal-shaped `OverallRow` (Task 15), `sortByMedals` (Task 15).
- Produces: `LeaderboardTable` props `{ rows: OverallRow[]; me?: string; viewerRow?: { row: OverallRow; rank: number } }` (drops `sortKey`/`onSort`). Collapsed row: `rank · name(+crown if #1) · 🥇🥈🥉 · played`; a muted sub-line shows games led when non-empty.

- [ ] **Step 1: Write the failing test**

Create `src/components/leaderboardTable.test.tsx`:
```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import type { OverallRow } from "@/lib/api";

afterEach(() => cleanup());

const rows: OverallRow[] = [
  { displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 12, gamesLed: ["wordle", "pips"] },
  { displayName: "Amy", gold: 1, silver: 2, bronze: 1, gamesPlayed: 9, gamesLed: [] },
];

describe("LeaderboardTable (medal tally)", () => {
  it("renders gold/silver/bronze counts and played", () => {
    render(<LeaderboardTable rows={rows} me="Amy" />);
    expect(screen.getByText(/🥇/)).toBeTruthy();
    expect(screen.getAllByText("DJ").length).toBeGreaterThan(0);
    expect(screen.getByText("12")).toBeTruthy(); // played
  });

  it("shows a games-led sub-line only when non-empty", () => {
    const { container } = render(<LeaderboardTable rows={rows} />);
    expect(container.textContent).toMatch(/leads:/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/leaderboardTable.test.tsx`
Expected: FAIL — LeaderboardTable still expects `sortKey`/`onSort` and renders `wins`.

- [ ] **Step 3: Rewrite `LeaderboardTable`**

Replace `src/components/LeaderboardTable.tsx` with:
```tsx
import React from "react";
import type { OverallRow } from "@/lib/api";
import { Crown } from "@/design/icons";
import styles from "./LeaderboardTable.module.css";

export interface LeaderboardTableProps {
  rows: OverallRow[];
  me?: string;
  /** Viewer's true row rendered below a gap when they're outside the visible rows. */
  viewerRow?: { row: OverallRow; rank: number };
}

function MedalCell({ row }: { row: OverallRow }): JSX.Element {
  return <span>🥇{row.gold} 🥈{row.silver} 🥉{row.bronze}</span>;
}

function Row({ row, rank, me }: { row: OverallRow; rank: number; me?: string }): JSX.Element {
  const isMe = row.displayName === me;
  return (
    <tr className={[styles.row, isMe ? styles.me : ""].filter(Boolean).join(" ")}>
      <td className={styles.rankCell}>{rank}</td>
      <td className={styles.nameCell}>
        <span className={styles.nameWrap}>
          {row.displayName}
          {rank === 1 && <Crown size={14} className={styles.crown} />}
        </span>
        {row.gamesLed.length > 0 && <span className={styles.subLine}>Leads: {row.gamesLed.join(", ")}</span>}
      </td>
      <td className={styles.statCell}><MedalCell row={row} /></td>
      <td className={styles.statCell}>{row.gamesPlayed}</td>
    </tr>
  );
}

export function LeaderboardTable({ rows, me, viewerRow }: LeaderboardTableProps): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.headerRow}>
          <th className={styles.headerCell} />
          <th className={styles.headerCell}>Player</th>
          <th className={styles.headerCell}>Medals</th>
          <th className={styles.headerCell}>Played</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <Row key={row.displayName} row={row} rank={index + 1} me={me} />
        ))}
        {viewerRow && (
          <>
            <tr className={styles.gapRow} aria-hidden="true">
              <td className={styles.gapCell} colSpan={4}>⋯</td>
            </tr>
            <Row row={viewerRow.row} rank={viewerRow.rank} me={me} />
          </>
        )}
      </tbody>
    </table>
  );
}
```
Add to `src/components/LeaderboardTable.module.css`:
```css
.subLine {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 2px;
}
```

- [ ] **Step 4: Wire Home (`src/app/(app)/page.tsx`)**

- Drop `sortPlayers`/`LeaderboardSortKey` imports; add `import { sortByMedals } from "@/lib/leaderboardSort";`.
- Remove `sortKey`/`onSort` state and props.
- `bestCurrentStreak` unchanged. In `HomeReady`, replace the sorted computation:
```tsx
  const sorted = sortByMedals(rows);
  const snapshot = sorted.slice(0, SNAPSHOT_SIZE);
  const viewerIdx = name ? sorted.findIndex((r) => r.displayName === name) : -1;
  const viewerRow = viewerIdx >= SNAPSHOT_SIZE ? { row: sorted[viewerIdx], rank: viewerIdx + 1 } : undefined;
```
- Render: `<LeaderboardTable rows={snapshot} me={name ?? undefined} viewerRow={viewerRow} />` (drop sort props). Remove `sortKey`/`onSort` from `HomeReadyProps` and the `Home` component.

- [ ] **Step 5: Wire You (`src/app/(app)/you/page.tsx`)**

- `rankOf`: change the sort to medals — `const sorted = [...rows].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);`
- Wins StatCard: the profile "Wins" tile now shows golds. Replace `const wins = myRow?.wins ?? 0;` with `const golds = myRow?.gold ?? 0;` and the StatCard: `<StatCard value={golds} label="Golds" />`. Remove the `winRate` StatCard (no longer computed at overall level) and replace with a medals summary: `<StatCard value={\`🥈${myRow?.silver ?? 0} 🥉${myRow?.bronze ?? 0}\`} label="Other medals" />`. Keep `<StatCard value={bestStreak} label="Best streak" />`.

- [ ] **Step 6: Update `you.test.tsx` fixtures to medal-shaped OverallRow**

In `src/components/you.test.tsx`, change `leaderboardRows` to:
```ts
const leaderboardRows: OverallRow[] = [
  { displayName: "DJ", gold: 18, silver: 2, bronze: 1, gamesPlayed: 20, gamesLed: [] },
  { displayName: "You", gold: 16, silver: 1, bronze: 0, gamesPlayed: 19, gamesLed: [] },
  { displayName: "Devanshi", gold: 14, silver: 3, bronze: 2, gamesPlayed: 18, gamesLed: [] },
];
```
Adjust the StatCard assertions: `screen.getByText("16")` (golds) still holds for "You"; drop the `84%` win-rate assertion and instead assert the golds tile label: `expect(screen.getByText("Golds")).toBeTruthy();`. Rank assertions (#2, #3) still hold (sorted by gold: 18,16,14).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components/leaderboardTable.test.tsx src/components/you.test.tsx src/components/standings.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS (all old `OverallRow.wins`/`winRate` references gone).

- [ ] **Step 8: Commit**

```bash
git add src/components/LeaderboardTable.tsx src/components/LeaderboardTable.module.css src/components/leaderboardTable.test.tsx src/app/(app)/page.tsx src/app/(app)/you/page.tsx src/components/you.test.tsx
git commit -m "feat(overall): medal-tally LeaderboardTable wired into Home + You"
```

---

## Task 18: Today-only inline collapsible — stat pills + verbatim grid

**Files:**
- Create: `src/components/StatPills.tsx`
- Create: `src/components/ResultGrid.tsx`
- Create: `src/components/ResultGrid.module.css`
- Modify: `src/components/DailyContestTable.tsx` (rows become expandable)
- Test: `src/components/dailyContest.test.tsx` (new)

**Interfaces:**
- Consumes: `DailyContestRow` (Task 14), `ResultDetail` (Task 1), `shapeForGame` (Task 3), `formatClock` (Task 2).
- Produces:
  - `StatPills` props `{ gameId: string; row: DailyContestRow }` — renders solved/failed, the core metric in units, today's medal, and game-specific extras (hard mode, backtracks, redraws, under-par, difficulty, theme).
  - `ResultGrid` props `{ grid: string[]; dim?: boolean[] }` — renders `detail.grid` verbatim (monospace rows); Connections mistake rows dimmed via `dim`.
  - `DailyContestTable` rows are expandable ONLY when the game has detail-worthy content; aggregate rows never expand (that table is untouched).

**Design (binding — keep it simple):** the collapsed contest row stays `rank · name · medal+value · chevron`. Tapping toggles an in-place expansion below the row: stat pills, then (Wordle/Connections/Strands) the verbatim grid. Timed games show pills only (no grid). Rows without detail don't render a chevron and don't expand.

- [ ] **Step 1: Write the failing test**

Create `src/components/dailyContest.test.tsx`:
```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { DailyContestTable } from "@/components/DailyContestTable";
import type { DailyContestRow } from "@/lib/api";

afterEach(() => cleanup());

const wordleRow: DailyContestRow = {
  displayName: "DJ", value: 3, valueFormatted: "3/6 ✓", solved: true, medal: "gold",
  detail: { guesses: 3, solved: true, hardMode: true, grid: ["⬛🟨⬛⬛⬛", "🟩🟩🟩🟩🟩"] },
};
const timedRow: DailyContestRow = {
  displayName: "Amy", value: 45, valueFormatted: "0:45", solved: true, medal: "silver",
  detail: { seconds: 45, backtracks: 1 },
};
const noDetailRow: DailyContestRow = {
  displayName: "Zed", value: 4, valueFormatted: "4/6 ✓", solved: true, medal: null, detail: null,
};

describe("DailyContestTable expansion (today-only)", () => {
  it("expands a Wordle row to stat pills + the verbatim grid on tap", () => {
    render(<DailyContestTable rows={[wordleRow]} gameId="wordle" />);
    fireEvent.click(screen.getByRole("button", { name: /details|expand/i }));
    expect(screen.getByText(/hard mode/i)).toBeTruthy();
    expect(screen.getByText("🟩🟩🟩🟩🟩")).toBeTruthy();
  });

  it("expands a timed row to pills only (no grid)", () => {
    render(<DailyContestTable rows={[timedRow]} gameId="zip" />);
    fireEvent.click(screen.getByRole("button", { name: /details|expand/i }));
    expect(screen.getByText(/backtrack/i)).toBeTruthy();
    expect(screen.queryByText(/🟩/)).toBeNull();
  });

  it("does not render an expand control for rows without detail", () => {
    render(<DailyContestTable rows={[noDetailRow]} gameId="wordle" />);
    expect(screen.queryByRole("button", { name: /details|expand/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dailyContest.test.tsx`
Expected: FAIL — `DailyContestTable` doesn't accept `gameId` / isn't expandable.

- [ ] **Step 3: Write `ResultGrid`**

Create `src/components/ResultGrid.tsx`:
```tsx
import React from "react";
import styles from "./ResultGrid.module.css";

export interface ResultGridProps {
  grid: string[];
  /** Optional per-row dim flags (Connections mistake rows). */
  dim?: boolean[];
}

export function ResultGrid({ grid, dim }: ResultGridProps): JSX.Element {
  return (
    <div className={styles.grid} role="img" aria-label="result grid">
      {grid.map((line, i) => (
        <div key={i} className={[styles.gridRow, dim?.[i] ? styles.dim : ""].filter(Boolean).join(" ")}>
          {line}
        </div>
      ))}
    </div>
  );
}
```
Create `src/components/ResultGrid.module.css`:
```css
.grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 18px;
  line-height: 1.1;
  margin-top: 8px;
}
.gridRow {
  letter-spacing: 1px;
}
.dim {
  opacity: 0.4;
}
```

- [ ] **Step 4: Write `StatPills`**

Create `src/components/StatPills.tsx`:
```tsx
import React from "react";
import type { DailyContestRow } from "@/lib/api";
import { shapeForGame } from "@/lib/formatResult";
import { formatClock } from "@/lib/time";
import styles from "./StatPills.module.css";

const MEDAL_EMOJI: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };

export interface StatPillsProps {
  gameId: string;
  row: DailyContestRow;
}

function pills(gameId: string, row: DailyContestRow): string[] {
  const d = row.detail ?? {};
  const out: string[] = [];
  out.push(row.solved ? "Solved" : "Failed");
  if (row.medal) out.push(MEDAL_EMOJI[row.medal]);

  switch (shapeForGame(gameId)) {
    case "wordle":
      if (typeof d.guesses === "number") out.push(`${d.guesses}/6 guesses`);
      if (d.hardMode) out.push("Hard mode");
      break;
    case "pinpoint":
      if (typeof d.guesses === "number") out.push(`${d.guesses} guesses`);
      if (d.trail && d.trail.length) out.push(`Trail: ${d.trail.join("→")}%`);
      break;
    case "connections":
      out.push(d.mistakes === 0 ? "Perfect" : `${d.mistakes ?? 0} mistakes`);
      break;
    case "hints":
      out.push((d.hints ?? 0) === 0 ? "No hints" : `${d.hints} hints`);
      if (typeof d.underPar === "number") out.push(`${d.underPar} under par`);
      if (d.theme) out.push(`Theme: ${d.theme}`);
      break;
    case "timed":
      if (typeof d.seconds === "number") out.push(formatClock(d.seconds));
      if (typeof d.backtracks === "number") out.push(`${d.backtracks} backtracks`);
      if (typeof d.redraws === "number") out.push(`${d.redraws} redraws`);
      if (d.difficulty) out.push(d.difficulty);
      break;
  }
  return out;
}

export function StatPills({ gameId, row }: StatPillsProps): JSX.Element {
  return (
    <div className={styles.pills}>
      {pills(gameId, row).map((p, i) => (
        <span key={i} className={styles.pill}>{p}</span>
      ))}
    </div>
  );
}
```
Create `src/components/StatPills.module.css`:
```css
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.pill {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--surface-2, #f0f0f0);
  color: var(--text, #222);
  font-size: 12px;
  font-weight: 600;
}
```

- [ ] **Step 5: Make `DailyContestTable` rows expandable**

Replace `src/components/DailyContestTable.tsx` with:
```tsx
"use client";
import React, { useState } from "react";
import type { DailyContestRow } from "@/lib/api";
import { StatPills } from "@/components/StatPills";
import { ResultGrid } from "@/components/ResultGrid";
import { shapeForGame } from "@/lib/formatResult";
import { ChevronDown } from "@/design/icons";
import styles from "@/app/(app)/standings/page.module.css";

const MEDAL_EMOJI: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const GRID_SHAPES = new Set(["wordle", "connections", "hints"]); // Wordle/Connections/Strands render a grid

function hasDetail(row: DailyContestRow): boolean {
  const d = row.detail;
  return !!d && Object.keys(d).length > 0;
}

export interface DailyContestTableProps {
  rows: DailyContestRow[];
  gameId: string;
  me?: string;
}

export function DailyContestTable({ rows, gameId, me }: DailyContestTableProps): JSX.Element {
  const [openName, setOpenName] = useState<string | null>(null);
  const showGrid = GRID_SHAPES.has(shapeForGame(gameId)) && gameId !== "minute-cryptic"; // minute-cryptic is hints-shaped but gridless
  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={styles.boardHeaderCell}>Result</th>
          <th className={styles.boardHeaderCell} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const expandable = hasDetail(row);
          const open = openName === row.displayName;
          const dim = gameId === "connections" && row.detail?.grid
            ? row.detail.grid.map((line) => new Set(line).size > 1) // mixed rows = mistakes → dim
            : undefined;
          return (
            <React.Fragment key={row.displayName}>
              <tr className={[styles.boardRow, row.displayName === me ? styles.me : ""].filter(Boolean).join(" ")}>
                <td className={styles.rankCell}>{index + 1}</td>
                <td className={styles.nameCell}>{row.displayName}</td>
                <td className={styles.statCell}>
                  {row.medal ? `${MEDAL_EMOJI[row.medal]} ` : ""}
                  {row.valueFormatted}
                </td>
                <td className={styles.statCell}>
                  {expandable && (
                    <button
                      type="button"
                      aria-label={open ? "Hide details" : "Show details"}
                      onClick={() => setOpenName(open ? null : row.displayName)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  )}
                </td>
              </tr>
              {expandable && open && (
                <tr>
                  <td colSpan={4}>
                    <StatPills gameId={gameId} row={row} />
                    {showGrid && row.detail?.grid && row.detail.grid.length > 0 && (
                      <ResultGrid grid={row.detail.grid} dim={dim} />
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
```
> `DailyContestTable` now requires a `gameId` prop. Update the call site in `src/app/(app)/standings/page.tsx` (Task 16 Step 5): `<DailyContestTable rows={board.rows as DailyContestRow[]} gameId={gameKey} me={viewerName ?? undefined} />`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/dailyContest.test.tsx src/components/standings.test.tsx`
Expected: PASS. (The Task 16 standings test used `DailyContestTable` without `gameId`; the page now passes `gameKey` — the standings test drives the page, not the table directly, so it stays green.)
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/StatPills.tsx src/components/StatPills.module.css src/components/ResultGrid.tsx src/components/ResultGrid.module.css src/components/DailyContestTable.tsx src/app/(app)/standings/page.tsx src/components/dailyContest.test.tsx
git commit -m "feat(process): today-only inline collapsible (stat pills + verbatim grid)"
```

---

## Final verification (run before opening the PR)

- [ ] **Full suite green**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all PASS, no secrets, build succeeds.

- [ ] **Manual smoke of the value formatting (pure)**

Run: `npx vitest run src/lib/formatResult.test.ts src/scoring/medals.test.ts`
Expected: PASS — the two purest, most load-bearing suites.

---

## Self-review checklist

Run this yourself against the spec before handing off.

**1. Spec coverage (each spec section → task):**
- Data model (`detail JSONB`, keep scalar, backfill) → Tasks 1, 6, 7, 8. ✔
- `formatResult` (mm:ss incl. 0:0N/9:53; Wordle solved/failed no sentinel; Perfect/Failed; No hints) → Tasks 2, 3. ✔
- Parser `detail` for all ~14 (per-game shapes verbatim) → Tasks 4 (Wordle worked example), 5 (remaining 13 table). ✔ (NYT Mini has no parser — noted; formats as timed.)
- Scoring: daily win → placements/medals w/ ties → Task 10; aggregate medal board + PB → Task 11; Overall medal tally + games led + total played → Task 12; today live contest → Task 13; streaks unchanged (still in `gameBoard.ts`/`me.ts`). ✔
- Surfaces: Board one control row (Game ▾ + Window ▾), Overall/aggregate/daily → Tasks 14, 16; Home snapshot of Overall tally → Task 17; You proper units → Tasks 9, 17. ✔
- Today-only collapsible (stat pills + verbatim grid Wordle/Connections/Strands; Connections dim; timed = pills only; aggregate flat) → Task 18. ✔
- No-peek unchanged → preserved in Tasks 14 (`isDailyBoardLocked`) & 15 (existing daily gate). ✔
- Played-as-context → `gamesPlayed` on medal board (Task 11/16) + Overall total + games led sub-line (Task 12/17). ✔
- Rollout as one build (branch/PR/deploy) → Global Constraints + Deploy gates; no intermediate release tasks. ✔
- Testing strategy: pure formatResult/medals/PB → Tasks 3, 10–13; parser detail per sample → Tasks 4–5; component (units, medals, expand, aggregate-flat, dropdowns, no-peek) → Tasks 16–18; backfill dry-run coverage → Task 7. ✔

**2. Placeholder scan:** No "TBD/similar to Task N/add error handling". Each code step ships complete code. The one intentional DRY compression (Task 5) lists every parser's exact `detail` fields + a real sample + exact extraction — not a hand-wave.

**3. Type consistency (names checked across tasks):**
- `ResultDetail` (Task 1) used identically in Tasks 3, 5, 7, 8, 9, 14, 18.
- `MedalCounts`/`Medal` defined in `api.ts` (Task 14) and `medals.ts` (Task 10) — structurally identical `{ gold; silver; bronze }`; the client redeclares to avoid importing server scoring into the bundle. Consistent field names throughout.
- `formatResult(gameId, value, solved, detail?)` — same 4-arg signature at every call site (You Task 9; routes Task 14; pills use `formatClock`/`shapeForGame` directly).
- `computeMedalBoard(entries, start)`, `computeOverallMedals(entries)`, `computeDailyContest(entries)`, `tallyMedals(entries)` — signatures stable from Tasks 10–13 into the routes (Tasks 14–15).
- `OverallRow`/`MedalBoardRow`/`DailyContestRow` — one definition each in `api.ts`, consumed unchanged by every component.
- `GameWindowNav`/`MedalBoardTable`/`DailyContestTable` prop names stable between Tasks 16 and 18 (Task 18 adds the required `gameId` prop to `DailyContestTable` and updates the single call site).

**Known judgment calls flagged for the controller (see inline):**
- Task 3: `formatResult(gameId, value, solved, detail?)` collapses the spec's `(gameType, metric)` into a game-keyed shape lookup; Pips' difficulty tag is carried by `variant`/pills, not baked into the timed mm:ss string.
- Task 7: re-parse backfill uses the REAL parsers via a new dev-only `tsx` devDependency + `npx tsx scripts/backfill-detail.mjs` (Node v20 can't strip TS; re-implementing 14 parsers in `.mjs` would break DRY). Pure coverage logic still lives in a unit-tested `src/lib` module.
- Task 17: the You "Wins/Win%" tiles become "Golds" + "Other medals" since the Overall board is now a medal tally (no win-rate at the overall level).
