# Puzzle True-Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** File each entry on the puzzle's *true* date (from its number+epoch or an embedded date), not the day it was logged — so a "daily" contest only ever compares the same puzzle.

**Architecture:** Additive + display/scoring-neutral. A new pure helper `resolvePuzzleDate` maps `(gameId, puzzleNumber, parsedDate)` → the true date, using a per-game epoch table (`true_date = epoch + puzzleNumber`) or a date the parser extracted from the share text (India Mini URL, Minute Cryptic header), falling back to log-date. The entries write path uses it to set `puzzle_date`. `is_late` is left `false` (catch-up logs count normally, per owner). Everything downstream (windows/streaks/grouping) is unchanged because the date is now correct. A one-time backfill re-dates the 9 known mis-filed rows.

**Tech Stack:** Next.js 14.2 App Router route handlers, TypeScript, Neon stateless `sql` client, Vitest.

## Global Constraints

- **No schema migration.** `puzzle_date`, `puzzle_number`, `is_late` columns already exist. This is code-only + a data backfill + a prod `games.active` flip for NYT Mini.
- **Ranking scalar untouched.** `parsed_value`/`solved` unchanged. `is_late` stays `false` (do NOT set it true). The existing `is_late = false` read filters are left as harmless no-ops.
- **TZ-safe date math only.** Compute `epoch + number` via `toDayNumber`/`fromDayNumber` from `src/lib/day.ts`. Parse the Minute Cryptic header with a static month-name→index lookup — NEVER `new Date(str)`.
- **Verified epochs** (`true_date = epoch + puzzle_number` days; derived as the mode of `puzzle_date − puzzle_number` over correctly-filed prod rows, unanimous except the 9 known mis-files):
  `wordle 2021-06-19 · connections 2023-06-11 · strands 2024-03-03 · pinpoint 2024-04-30 · queens 2024-04-30 · crossclimb 2024-04-30 · tango 2024-10-07 · zip 2025-03-17 · mini-sudoku 2025-08-11 · pips 2025-08-18 · patches 2026-03-17 · wend 2026-06-08`.
- **Missing-epoch is a warn, not a silent fallback:** if a numbered game (has `puzzleNumber`) has no epoch, fall back to today AND emit `[epoch-missing]` via `console.warn` + `Sentry.captureMessage` (mirror `entries/route.ts`'s `[parse-failure]`).
- **Do NOT run anything under `scripts/`.** The backfill is authored, dry-run/applied only at the gated deploy with owner go-ahead.

---

## File Structure

- **Create** `src/lib/puzzleDate.ts` — `PUZZLE_EPOCH` + `resolvePuzzleDate` (Task 1).
- **Create** `src/lib/puzzleDate.test.ts` (Task 1).
- **Modify** `src/parsers/types.ts` — add optional `puzzleDate` to `ParseResult` (Task 1).
- **Modify** `src/parsers/indiaMini.ts`, `src/parsers/minuteCryptic.ts` + their tests — extract the embedded date (Task 2).
- **Modify** `src/lib/submission.ts` — add `puzzleDate` to `ResolvedSubmission`, thread it (Task 3).
- **Modify** `src/app/api/entries/route.ts` + `entries.test.ts` — set `puzzle_date` via `resolvePuzzleDate` + epoch-missing warn (Task 3).
- **Create** `src/lib/backfillPuzzleDateVerify.ts` + test; `scripts/backfill-puzzle-dates.mjs` (Task 4).

---

## Task 1: `resolvePuzzleDate` helper + epoch table + `ParseResult.puzzleDate`

**Files:**
- Modify: `src/parsers/types.ts`
- Create: `src/lib/puzzleDate.ts`, `src/lib/puzzleDate.test.ts`

**Interfaces:**
- Consumes: `toDayNumber`, `fromDayNumber` from `src/lib/day.ts`.
- Produces:
  - `ParseResult.puzzleDate?: string | null` (ISO `YYYY-MM-DD`).
  - `PUZZLE_EPOCH: Record<string, string>`.
  - `type PuzzleDateSource = "parsed" | "epoch" | "fallback"`.
  - `resolvePuzzleDate(input: { gameId: string; puzzleNumber: number | null; parsedDate?: string | null }, today: string): { date: string; source: PuzzleDateSource }`.

- [ ] **Step 1: Add `puzzleDate` to `ParseResult`** (`src/parsers/types.ts`, in the `ParseResult` interface after `detail`):
```ts
  /** The puzzle's true date (YYYY-MM-DD) when the parser can determine it directly (e.g. embedded in the share text). Optional; most games leave it undefined and are dated by puzzleNumber+epoch downstream. */
  puzzleDate?: string | null;
```

- [ ] **Step 2: Write the failing test** `src/lib/puzzleDate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolvePuzzleDate, PUZZLE_EPOCH } from "./puzzleDate";

describe("resolvePuzzleDate", () => {
  const today = "2026-07-09";

  it("computes epoch + number for numbered games (real anchors)", () => {
    expect(resolvePuzzleDate({ gameId: "pinpoint", puzzleNumber: 799 }, today)).toEqual({ date: "2026-07-08", source: "epoch" });
    expect(resolvePuzzleDate({ gameId: "pinpoint", puzzleNumber: 798 }, today)).toEqual({ date: "2026-07-07", source: "epoch" });
    expect(resolvePuzzleDate({ gameId: "mini-sudoku", puzzleNumber: 331 }, today)).toEqual({ date: "2026-07-08", source: "epoch" });
    expect(resolvePuzzleDate({ gameId: "mini-sudoku", puzzleNumber: 330 }, today)).toEqual({ date: "2026-07-07", source: "epoch" });
  });

  it("prefers an embedded parsedDate over the number", () => {
    expect(resolvePuzzleDate({ gameId: "india-mini", puzzleNumber: null, parsedDate: "2026-07-06" }, today))
      .toEqual({ date: "2026-07-06", source: "parsed" });
  });

  it("falls back to today when there is no identifier", () => {
    expect(resolvePuzzleDate({ gameId: "nyt-mini", puzzleNumber: null }, today)).toEqual({ date: today, source: "fallback" });
  });

  it("falls back to today (source fallback) for a numbered game with no epoch — caller warns", () => {
    expect(resolvePuzzleDate({ gameId: "brand-new-game", puzzleNumber: 5 }, today)).toEqual({ date: today, source: "fallback" });
  });

  it("has an epoch for every currently-numbered game", () => {
    for (const g of ["wordle","connections","strands","pinpoint","queens","crossclimb","tango","zip","mini-sudoku","pips","patches","wend"]) {
      expect(PUZZLE_EPOCH[g]).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Run → FAIL** (`npx vitest run src/lib/puzzleDate.test.ts`) — no module.

- [ ] **Step 4: Implement `src/lib/puzzleDate.ts`:**
```ts
import { toDayNumber, fromDayNumber } from "./day";

/**
 * Per-game "epoch" = the date on which puzzle number 0 would fall, so
 * true_date = epoch + puzzleNumber days. Derived as the mode of
 * (puzzle_date - puzzle_number) over correctly-filed prod rows (unanimous
 * per game). A numbered game MUST appear here; a missing entry falls back to
 * today and the caller emits an [epoch-missing] warning.
 */
export const PUZZLE_EPOCH: Record<string, string> = {
  wordle: "2021-06-19",
  connections: "2023-06-11",
  strands: "2024-03-03",
  pinpoint: "2024-04-30",
  queens: "2024-04-30",
  crossclimb: "2024-04-30",
  tango: "2024-10-07",
  zip: "2025-03-17",
  "mini-sudoku": "2025-08-11",
  pips: "2025-08-18",
  patches: "2026-03-17",
  wend: "2026-06-08",
};

export type PuzzleDateSource = "parsed" | "epoch" | "fallback";

/**
 * The puzzle's true date. Precedence: an embedded date the parser extracted →
 * epoch + puzzleNumber → today (fallback). `source` lets the caller warn when
 * a numbered game fell back for lack of an epoch.
 */
export function resolvePuzzleDate(
  input: { gameId: string; puzzleNumber: number | null; parsedDate?: string | null },
  today: string,
): { date: string; source: PuzzleDateSource } {
  if (input.parsedDate) return { date: input.parsedDate, source: "parsed" };
  const epoch = PUZZLE_EPOCH[input.gameId];
  if (input.puzzleNumber != null && epoch) {
    return { date: fromDayNumber(toDayNumber(epoch) + input.puzzleNumber), source: "epoch" };
  }
  return { date: today, source: "fallback" };
}
```

- [ ] **Step 5: Run → PASS.** If any epoch anchor assertion fails, STOP — the epoch is wrong; do not adjust the test to match, investigate the value.

- [ ] **Step 6: Typecheck + commit.** `npx tsc --noEmit` (0), then:
```bash
git add src/parsers/types.ts src/lib/puzzleDate.ts src/lib/puzzleDate.test.ts
git commit -m "feat(dates): resolvePuzzleDate helper + per-game epoch table + ParseResult.puzzleDate"
```

---

## Task 2: India Mini & Minute Cryptic emit their embedded date

**Files:**
- Modify: `src/parsers/indiaMini.ts`, `src/parsers/indiaMini.test.ts`
- Modify: `src/parsers/minuteCryptic.ts`, `src/parsers/minuteCryptic.test.ts`

**Interfaces:**
- Produces: `indiaMiniParser.parse(...)` and `minuteCrypticParser.parse(...)` now set `puzzleDate` (ISO) when the share text contains it; otherwise leave it undefined. `value`/`solved`/`detail` unchanged.

- [ ] **Step 1: Write failing tests.**
Append to `src/parsers/indiaMini.test.ts` (the file's sample URL is `…al-crossword-mini-20260702…`):
```ts
it("extracts the puzzle date from the share URL", () => {
  const text = "I just solved this Crossword in 59 seconds.\nhttps://indiamini.in/play/?id=al-crossword-mini-20260706&set=";
  expect(indiaMiniParser.parse(text).puzzleDate).toBe("2026-07-06");
});
it("leaves puzzleDate undefined when the URL has no date", () => {
  const text = "I just solved this Crossword in 59 seconds.\nhttps://indiamini.in/play/";
  expect(indiaMiniParser.parse(text).puzzleDate ?? null).toBeNull();
});
```
Append to `src/parsers/minuteCryptic.test.ts` (header format `Minute Cryptic - 1 July, 2026`):
```ts
it("extracts the puzzle date from the header (static month lookup, no Date parsing)", () => {
  const text = "Minute Cryptic - 6 July, 2026\n🏆 0 hints – 1 under the community par.";
  expect(minuteCrypticParser.parse(text).puzzleDate).toBe("2026-07-06");
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/parsers/indiaMini.test.ts src/parsers/minuteCryptic.test.ts`).

- [ ] **Step 3: Implement India Mini** — add to `src/parsers/indiaMini.ts` before the `parse` return, and include `puzzleDate` in the returned object:
```ts
    // Date embedded in the share URL: al-crossword-mini-YYYYMMDD
    const dm = text.match(/al-crossword-mini-(\d{4})(\d{2})(\d{2})/);
    const puzzleDate = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;
```
Then in the returned object add `puzzleDate,` (alongside the existing fields).

- [ ] **Step 4: Implement Minute Cryptic** — add to `src/parsers/minuteCryptic.ts`:
```ts
const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};
```
Inside `parse`, before the return:
```ts
    // Header: "Minute Cryptic - D Month, YYYY" — static month lookup, no Date().
    const dm = text.match(/Minute Cryptic\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/i);
    let puzzleDate: string | null = null;
    if (dm) {
      const mm = MONTHS[dm[2].toLowerCase()];
      if (mm) puzzleDate = `${dm[3]}-${mm}-${dm[1].padStart(2, "0")}`;
    }
```
Then add `puzzleDate,` to the returned object.

- [ ] **Step 5: Run → PASS**, `npx tsc --noEmit` (0), full suite `npx vitest run`.

- [ ] **Step 6: Commit**
```bash
git add src/parsers/indiaMini.ts src/parsers/indiaMini.test.ts src/parsers/minuteCryptic.ts src/parsers/minuteCryptic.test.ts
git commit -m "feat(parsers): India Mini & Minute Cryptic emit the puzzle's embedded date"
```

---

## Task 3: Thread `puzzleDate` + set the true `puzzle_date` on write

**Files:**
- Modify: `src/lib/submission.ts`
- Modify: `src/app/api/entries/route.ts`, `src/app/api/entries/entries.test.ts`

**Interfaces:**
- Consumes: `resolvePuzzleDate` (Task 1); `puzzleDate` on parse results (Tasks 1–2).
- Produces: `ResolvedSubmission.puzzleDate: string | null`; `POST /api/entries` files by the true date.

- [ ] **Step 1: Thread through `resolveSubmission`** (`src/lib/submission.ts`):
Add to the `ResolvedSubmission` interface: `puzzleDate: string | null;`
Paste mode already spreads `parsed` (which now carries `puzzleDate`), but make it explicit and defaulted:
```ts
    return { ...parsed, puzzleDate: parsed.puzzleDate ?? null, rawInput: b.rawInput };
```
Manual mode return: add `puzzleDate: null,` alongside `puzzleNumber: null`.

- [ ] **Step 2: Update entries tests first** (`src/app/api/entries/entries.test.ts`):
Add `puzzleDate: null` to the `RESOLVED_SUBMISSION` fixture. Add tests (the route computes `puzzle_date` now):
```ts
it("files the entry on the puzzle's true date (number + epoch), not today", async () => {
  guardMock.mockResolvedValue(USER_VIEWER);
  resolveSubmissionMock.mockReturnValue({ gameId: "pinpoint", variant: null, value: 1, solved: true, puzzleNumber: 798, puzzleDate: null, rawInput: "x" });
  sqlMock.mockResolvedValueOnce([{ id: "pinpoint" }]).mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
  await POST(jsonRequest({ rawInput: "x" }));
  const insert = sqlMock.mock.calls.find((c) => String(c[0].join("")).includes("INSERT INTO entries"));
  expect(insert!.slice(1)).toContain("2026-07-07"); // pinpoint #798 true date, regardless of "today"
});

it("uses an embedded parsedDate when present", async () => {
  guardMock.mockResolvedValue(USER_VIEWER);
  resolveSubmissionMock.mockReturnValue({ gameId: "india-mini", variant: null, value: 59, solved: true, puzzleNumber: null, puzzleDate: "2026-07-06", rawInput: "x" });
  sqlMock.mockResolvedValueOnce([{ id: "india-mini" }]).mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
  await POST(jsonRequest({ rawInput: "x" }));
  const insert = sqlMock.mock.calls.find((c) => String(c[0].join("")).includes("INSERT INTO entries"));
  expect(insert!.slice(1)).toContain("2026-07-06");
});
```
> `USER_VIEWER`/`jsonRequest` already exist in the file. The insert-arg check reuses the file's bound-parameter inspection style.

- [ ] **Step 3: Run → FAIL** (route still uses `localDateInTz`).

- [ ] **Step 4: Implement the route change** (`src/app/api/entries/route.ts`):
Add imports:
```ts
import { resolvePuzzleDate } from "@/lib/puzzleDate";
```
Replace `const puzzleDate = localDateInTz(PLATFORM_TZ);` with:
```ts
  const today = localDateInTz(PLATFORM_TZ);
  const resolvedDate = resolvePuzzleDate(
    { gameId: resolved.gameId, puzzleNumber: resolved.puzzleNumber, parsedDate: resolved.puzzleDate },
    today,
  );
  if (resolvedDate.source === "fallback" && resolved.puzzleNumber != null) {
    console.warn("[epoch-missing]", resolved.gameId);
    Sentry.captureMessage("[epoch-missing] " + resolved.gameId, "warning");
    await Sentry.flush(2000);
  }
  const puzzleDate = resolvedDate.date;
```
(`Sentry` and `localDateInTz`/`PLATFORM_TZ` are already imported. `is_late` stays `false` in the INSERT — do NOT change it.)

- [ ] **Step 5: Run → PASS** (`npx vitest run src/app/api/entries/entries.test.ts`), `npx tsc --noEmit` (0), full suite.

- [ ] **Step 6: Commit**
```bash
git add src/lib/submission.ts src/app/api/entries/route.ts src/app/api/entries/entries.test.ts
git commit -m "feat(entries): file by the puzzle's true date via resolvePuzzleDate (+ epoch-missing warn)"
```

---

## Task 4: One-time backfill (pure verify module + authored script)

**Files:**
- Create: `src/lib/backfillPuzzleDateVerify.ts`, `src/lib/backfillPuzzleDateVerify.test.ts`
- Create: `scripts/backfill-puzzle-dates.mjs`

**Interfaces:**
- Consumes: `resolvePuzzleDate` (Task 1).
- Produces: `planPuzzleDateBackfill(rows, today): { updates: {id,from,to}[]; skips: {id,reason}[] }` (pure); a thin `.mjs` runner (authored, NOT run here).

- [ ] **Step 1: Write the failing test** `src/lib/backfillPuzzleDateVerify.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planPuzzleDateBackfill } from "./backfillPuzzleDateVerify";

const today = "2026-07-09";
// row: { id, userId, gameId, variant, puzzleNumber, parsedDate, puzzleDate }
describe("planPuzzleDateBackfill", () => {
  it("re-dates a mis-filed numbered row to its true date", () => {
    const r = planPuzzleDateBackfill([
      { id: "e1", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 798, parsedDate: null, puzzleDate: "2026-07-08" },
    ], today);
    expect(r.updates).toEqual([{ id: "e1", from: "2026-07-08", to: "2026-07-07" }]);
    expect(r.skips).toEqual([]);
  });

  it("leaves a correctly-filed row untouched", () => {
    const r = planPuzzleDateBackfill([
      { id: "e2", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 799, parsedDate: null, puzzleDate: "2026-07-08" },
    ], today);
    expect(r.updates).toEqual([]);
  });

  it("skips (does not clobber) when re-dating would collide with an existing active row for the same slot", () => {
    const r = planPuzzleDateBackfill([
      { id: "eOld", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 798, parsedDate: null, puzzleDate: "2026-07-08" },
      { id: "eThere", userId: "u1", gameId: "pinpoint", variant: null, puzzleNumber: 798, parsedDate: null, puzzleDate: "2026-07-07" },
    ], today);
    expect(r.updates).toEqual([]);
    expect(r.skips.map((s) => s.id)).toContain("eOld");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/backfillPuzzleDateVerify.ts`:**
```ts
import { resolvePuzzleDate } from "./puzzleDate";

export interface BackfillRow {
  id: string;
  userId: string;
  gameId: string;
  variant: string | null;
  puzzleNumber: number | null;
  parsedDate: string | null;
  puzzleDate: string; // current stored date
}

/**
 * Decides which rows to re-date to their true puzzle date. Pure. A row is
 * updated when its computed true date differs from the stored one. It is
 * skipped (never clobbered) when re-dating would land on the active slot
 * (userId, gameId, variant, targetDate) of another row.
 */
export function planPuzzleDateBackfill(
  rows: BackfillRow[],
  today: string,
): { updates: { id: string; from: string; to: string }[]; skips: { id: string; reason: string }[] } {
  const slot = (userId: string, gameId: string, variant: string | null, date: string) =>
    `${userId}|${gameId}|${variant ?? ""}|${date}`;
  const occupied = new Set(rows.map((r) => slot(r.userId, r.gameId, r.variant, r.puzzleDate)));

  const updates: { id: string; from: string; to: string }[] = [];
  const skips: { id: string; reason: string }[] = [];
  for (const r of rows) {
    const to = resolvePuzzleDate({ gameId: r.gameId, puzzleNumber: r.puzzleNumber, parsedDate: r.parsedDate }, today).date;
    if (to === r.puzzleDate) continue;
    const target = slot(r.userId, r.gameId, r.variant, to);
    if (occupied.has(target)) {
      skips.push({ id: r.id, reason: `target slot ${to} already occupied` });
      continue;
    }
    occupied.add(target);
    occupied.delete(slot(r.userId, r.gameId, r.variant, r.puzzleDate));
    updates.push({ id: r.id, from: r.puzzleDate, to });
  }
  return { updates, skips };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Author `scripts/backfill-puzzle-dates.mjs`** (NOT executed here; run at the gated deploy). It selects active entries, re-parses `raw_input` via `detectAndParse` to recover `puzzleNumber`/`puzzleDate`, calls `planPuzzleDateBackfill`, prints the plan under `--dry-run`, and otherwise `UPDATE entries SET puzzle_date = ${to} WHERE id = ${id}` for each update (only `puzzle_date`; never other columns). Model it on `scripts/backfill-detail.mjs` (imports `detectAndParse` from `../src/parsers/registry`, reads `DATABASE_URL`, run via `tsx`). Print `updates` and `skips`; apply only when `--dry-run` is absent.

- [ ] **Step 6: Verify + commit.** `npx vitest run` (all pass), `npx tsc --noEmit` (0), `npm run build`. Do NOT run the script.
```bash
git add src/lib/backfillPuzzleDateVerify.ts src/lib/backfillPuzzleDateVerify.test.ts scripts/backfill-puzzle-dates.mjs
git commit -m "feat(backfill): plan + script to re-date mis-filed entries to their true puzzle date"
```

---

## Deploy (gated — owner go-ahead; no schema migration)

1. Backup tag `main` + note a Neon PITR point.
2. Merge the code (Tasks 1–4) → prod auto-deploys.
3. `npx tsx scripts/backfill-puzzle-dates.mjs --dry-run` against prod → confirm it targets **exactly the 9 mis-filed rows** (0 unexpected updates, 0 skips) → then run without `--dry-run`.
4. `UPDATE games SET active = false WHERE id = 'nyt-mini'` on prod (confirm against the live `games` table first; reversible; keeps its 1 entry).
Nothing to prod without explicit go-ahead.

## Out of scope

- Removing the manual-entry feature (separate upcoming change; until then hand-typed entries keep the log-date fallback).
- Re-keying scoring by puzzle number; non-daily/skipped-number handling (not present in any current game; the missing-epoch warn + the deploy dry-run surface any drift).

## Self-Review

- **Spec coverage:** `puzzleDate` contract + helper + epoch table (Task 1); India Mini/Minute Cryptic extraction (Task 2); thread through `ResolvedSubmission` + write path + epoch-missing warn (Task 3); pure backfill verify + authored script re-dating only `puzzle_date`, collision-skip (Task 4); NYT Mini flip + gated deploy (Deploy). `is_late` intentionally untouched (Global Constraints). ✓
- **Placeholder scan:** none — all code/tests/commands concrete; the one prose step (Task 4 Step 5, the `.mjs`) names the exact model file, imports, columns, and flags.
- **Type consistency:** `resolvePuzzleDate` return `{ date, source }` used identically in Tasks 3 & 4; `ResolvedSubmission.puzzleDate: string | null` matches the route's read; `PUZZLE_EPOCH` keys match the numbered games; date math via `toDayNumber`/`fromDayNumber` (existing).
