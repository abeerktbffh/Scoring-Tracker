# B007 — Hindu Mini: time → points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Hindu Mini auto-log after The Hindu changed its share from a TIME to a POINTS score (higher = better): new detection marker + score parse, a `"points"` display shape (`141 pts`), and a games-row `metric_direction` flip.

**Architecture:** One cohesive change across the parser, the two shape-consumers (`formatResult`, `StatPills`), the `ResultDetail` type, and the local seed script; plus a single prod `games`-row `UPDATE` at deploy. The parser stays registered as-is; scoring code is untouched (it reads `metric_direction` from the row). Old time-based entries are kept.

**Tech Stack:** Next.js 14.2 App Router, TypeScript, React 18, Vitest (+ jsdom for the component test), Neon.

## Global Constraints

- **Keep old time-based entries** — no data deletion.
- **Hindu Mini only** — do NOT touch `src/parsers/easyDown.ts` (deferred pending a sample).
- **Parser stays registered** in `src/parsers/registry.ts` (order unchanged; only `hinduMini.ts` internals change).
- **`gameLinks.ts` play-icon URL is out of scope** (flagged for a separate owner check; do not change it here).
- **Display everywhere:** `` `${value} pts` `` (e.g. `141 pts`).
- **Prod DB change is deploy-time only:** `UPDATE games SET metric_direction='higher_better' WHERE id='hindu-mini'`, done in the gated window after merge, with a read-only pre-flight + Neon restore point + owner go-ahead. Nothing merges or touches prod without owner go-ahead.

---

## Task 1: Hindu Mini points parser + display + seed

**Files:**
- Modify: `src/parsers/types.ts` (add `points?: number` to `ResultDetail`)
- Modify: `src/parsers/hinduMini.ts` (rewrite parser)
- Test: `src/parsers/hinduMini.test.ts` (rewrite for the new format)
- Modify: `src/lib/formatResult.ts` (add `"points"` shape + case; remap hindu-mini)
- Test: `src/lib/formatResult.test.ts` (add points cases)
- Modify: `src/components/StatPills.tsx` (add `"points"` case)
- Test: `src/components/StatPills.test.tsx` (new jsdom test)
- Test: `src/parsers/registry.test.ts` (add hindu-mini routing case)
- Modify: `scripts/add-hindu-games.mjs` (seed direction, line 9)

**Interfaces:**
- Produces: `hinduMiniParser.parse(text)` → `{ gameId:"hindu-mini", puzzleNumber:null, variant:null, value:<points>, solved:true, detail:{ points:<points> }, puzzleDate:null }`.
- Consumes: `shapeForGame(gameId): ResultShape` (now includes `"points"`); `ResultDetail.points?: number`; `DailyContestRow.value` (fallback in StatPills).

- [ ] **Step 1: Add `points` to `ResultDetail`.**

In `src/parsers/types.ts`, in the "Timed" block add a `points` line right after `seconds?: number;`:

```ts
  // Timed (Queens/Tango/Mini Sudoku/India Mini/Hindu Mini/Easy Down/NYT Mini/Zip/Crossclimb/Patches/Wend/Pips)
  seconds?: number;
  points?: number;          // Hindu Mini score (higher better)
```

- [ ] **Step 2: Rewrite the parser test (RED).**

Replace the entire contents of `src/parsers/hinduMini.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { hinduMiniParser } from "./hinduMini";

const SAMPLE =
  "I scored 141 on this Crossword. Think you can do better? https://www.thehindu.com/?id=cc734818&set=thehindu-mini-crossword&puzzleType=crossword";

describe("hindu mini parser (points format)", () => {
  it("detects the new set=thehindu-mini-crossword link, rejects others", () => {
    expect(hinduMiniParser.detect(SAMPLE)).toBe(true);
    // Easy Down's new-style link (different set= value)
    expect(
      hinduMiniParser.detect(
        "I scored 90 on this Crossword. https://www.thehindu.com/?id=abc&set=hindu-one-down&puzzleType=crossword",
      ),
    ).toBe(false);
    // India Mini
    expect(hinduMiniParser.detect("solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    // OLD time-format Hindu Mini link is no longer detected (that era is retired)
    expect(
      hinduMiniParser.detect(
        "I just solved The Hindu Mini in 2 minutes and 51 seconds. https://www.thehindu.com/crosswords/thehindu-mini-crossword",
      ),
    ).toBe(false);
    expect(hinduMiniParser.detect("Wordle 1,234 3/6")).toBe(false);
  });

  it("parses the score into value + detail.points, no number/date", () => {
    expect(hinduMiniParser.parse(SAMPLE)).toEqual({
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: 141,
      solved: true,
      detail: { points: 141 },
      puzzleDate: null,
    });
  });

  it("handles comma-formatted scores", () => {
    const s =
      "I scored 1,234 on this Crossword. https://www.thehindu.com/?id=z&set=thehindu-mini-crossword&puzzleType=crossword";
    expect(hinduMiniParser.parse(s).value).toBe(1234);
  });

  it("throws when the marker matches but no score is present", () => {
    const s =
      "I finished this Crossword! https://www.thehindu.com/?id=z&set=thehindu-mini-crossword&puzzleType=crossword";
    expect(() => hinduMiniParser.parse(s)).toThrow();
  });

  it("throws on non-matching text", () => {
    expect(() => hinduMiniParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
```

- [ ] **Step 3: Run the parser test → FAIL.**

Run: `npx vitest run src/parsers/hinduMini.test.ts`
Expected: FAIL — the current parser detects the old `/crosswords/…` URL and parses a time, so the new-format detect/parse assertions fail.

- [ ] **Step 4: Rewrite the parser (GREEN).**

Replace the entire contents of `src/parsers/hinduMini.ts` with:

```ts
import type { Parser, ParseResult } from "./types";

// The Hindu Mini crossword now shares an "I scored N on this Crossword…"
// sentence with a thehindu.com/?…&set=thehindu-mini-crossword&… link. The
// `set=thehindu-mini-crossword` query param is the reliable marker (the old
// /crosswords/ path is gone). Score is points, higher is better. PURE.
const MARKER = /set=thehindu-mini-crossword/i;
const SCORE = /scored\s+([\d,]+)/i;

export const hinduMiniParser: Parser = {
  gameId: "hindu-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not a Hindu Mini result");
    const m = SCORE.exec(text);
    if (!m) throw new Error("No score found in Hindu Mini result");
    const points = parseInt(m[1].replace(/,/g, ""), 10);
    return {
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: points,
      solved: true,
      detail: { points },
      puzzleDate: null,
    };
  },
};
```

- [ ] **Step 5: Run the parser test → PASS.**

Run: `npx vitest run src/parsers/hinduMini.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Add the `formatResult` points test (RED).**

In `src/lib/formatResult.test.ts`, add to the `shapeForGame` `describe` (inside the "maps each game" `it`, after the `nyt-mini` line):

```ts
    expect(shapeForGame("hindu-mini")).toBe("points");
```

And add a new `it` inside the `formatResult` `describe` (e.g. after the "timed" case):

```ts
  it("Points -> N pts (Hindu Mini)", () => {
    expect(formatResult("hindu-mini", 141, true)).toBe("141 pts");
  });
```

- [ ] **Step 7: Run → FAIL.**

Run: `npx vitest run src/lib/formatResult.test.ts`
Expected: FAIL — hindu-mini is still `"timed"`, so `shapeForGame` returns `"timed"` and `formatResult("hindu-mini",141,true)` returns `"2:21"`, not `"141 pts"`.

- [ ] **Step 8: Implement the `"points"` shape in `formatResult.ts`.**

Three edits in `src/lib/formatResult.ts`:

1. Extend the `ResultShape` union (line 4):
```ts
export type ResultShape = "timed" | "wordle" | "pinpoint" | "connections" | "hints" | "points";
```
2. Remap hindu-mini in `RESULT_SHAPE` (line 19): change `"hindu-mini": "timed",` to:
```ts
  "hindu-mini": "points",
```
3. Add the case to the `switch` in `formatResult` (e.g. after the `case "hints":` block):
```ts
    case "points":
      return `${value} pts`;
```
(The `switch` has no `default` and no trailing return, so the compiler requires this case — `npx tsc --noEmit` will flag TS2366 if it's missing.)

- [ ] **Step 9: Run → PASS.**

Run: `npx vitest run src/lib/formatResult.test.ts`
Expected: PASS.

- [ ] **Step 10: Add the StatPills test (RED).**

Create `src/components/StatPills.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatPills } from "./StatPills";
import type { DailyContestRow } from "@/lib/api";

afterEach(() => cleanup());

function row(overrides: Partial<DailyContestRow> = {}): DailyContestRow {
  return {
    displayName: "Me",
    value: 141,
    valueFormatted: "141 pts",
    solved: true,
    medal: null,
    detail: { points: 141 },
    variant: null,
    ...overrides,
  };
}

describe("StatPills points shape", () => {
  it("renders a '141 pts' pill for hindu-mini", () => {
    render(<StatPills gameId="hindu-mini" row={row()} />);
    expect(screen.getByText("141 pts")).toBeTruthy();
  });

  it("falls back to row.value when detail has no points (old time entries)", () => {
    render(<StatPills gameId="hindu-mini" row={row({ detail: null, value: 171 })} />);
    expect(screen.getByText("171 pts")).toBeTruthy();
  });
});
```

- [ ] **Step 11: Run → FAIL.**

Run: `npx vitest run src/components/StatPills.test.tsx`
Expected: FAIL — with hindu-mini now shaped `"points"`, the `switch` in `StatPills.pills()` has no `"points"` case, so no value pill is pushed and `getByText("141 pts")` finds nothing.

- [ ] **Step 12: Add the `"points"` case to `StatPills.tsx`.**

In `src/components/StatPills.tsx`, inside the `switch (shapeForGame(gameId))` in `pills()`, add after the `case "timed":` block (before the closing `}` of the switch):

```ts
    case "points":
      out.push(`${d.points ?? row.value} pts`);
      break;
```

(`row` is the function parameter; `d = row.detail ?? {}`. Old entries have no `detail.points`, so they fall back to `row.value`.)

- [ ] **Step 13: Run → PASS.**

Run: `npx vitest run src/components/StatPills.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 14: Add the registry routing case.**

In `src/parsers/registry.test.ts`, add one row to the `cases` array in the "routes every known game" block (after the `mini-sudoku` line):

```ts
    ["hindu-mini", "I scored 141 on this Crossword. Think you can do better? https://www.thehindu.com/?id=cc734818&set=thehindu-mini-crossword&puzzleType=crossword", "hindu-mini"],
```

Run: `npx vitest run src/parsers/registry.test.ts`
Expected: PASS — the sample routes to `hindu-mini` (no collision with easyDown/indiaMini).

- [ ] **Step 15: Update the local seed direction.**

In `scripts/add-hindu-games.mjs` line 9, change the hindu-mini row's direction from `"lower_better"` to `"higher_better"`:

```js
  ["hindu-mini", "Hindu Mini", "timed", "higher_better", "hindu-mini", false],
```

(Do NOT change the easy-down row. This script uses `ON CONFLICT (id) DO NOTHING`, so re-running it will NOT update the existing prod row — the manual `UPDATE` at deploy is what actually flips prod.)

- [ ] **Step 16: Typecheck, full suite, build.**

Run: `npx tsc --noEmit`
Expected: 0 errors (confirms the `formatResult` switch got its `"points"` case).

Run: `npx vitest run`
Expected: all tests pass.

Run: `npm run build`
Expected: build completes.

- [ ] **Step 17: Commit.**

```bash
git add src/parsers/types.ts src/parsers/hinduMini.ts src/parsers/hinduMini.test.ts \
        src/lib/formatResult.ts src/lib/formatResult.test.ts \
        src/components/StatPills.tsx src/components/StatPills.test.tsx \
        src/parsers/registry.test.ts scripts/add-hindu-games.mjs
git commit -m "fix(hindu-mini): parse points score + higher-better display (B007)"
```

---

## Deploy (gated — owner go-ahead)

Code + one prod row `UPDATE`, in a single gated window:

1. **Backup:** tag `pre-b007-hindu-points` on `origin/main`; note a Neon PITR timestamp before the DB write.
2. **Ship code:** PR → CI `verify` → owner approves → squash-merge.
3. **Prod DB pre-flight (read-only):** `SELECT id, name, metric_direction FROM games WHERE id='hindu-mini';` — show the owner the current row (`lower_better`).
4. **Flip direction (owner go-ahead):** `UPDATE games SET metric_direction='higher_better' WHERE id='hindu-mini';` — run immediately after merge so new points rank higher-better the moment the parser is live. Confirm 1 row updated; re-run the `SELECT` to verify.
5. **Verify on prod:** log the owner's sample ("I scored 141 …") — it parses, logs, shows `141 pts`, and ranks higher-better on the board.

## Self-Review

- **Spec coverage:**
  - Parser new marker + score extraction (comma-safe) → Steps 2/4 (`/set=thehindu-mini-crossword/i`, `/scored\s+([\d,]+)/i`, strip commas). ✓
  - `ResultDetail.points` → Step 1. ✓
  - `formatResult` `"points"` shape + hindu-mini remap → Steps 6/8. ✓
  - `StatPills` second consumer (silent-drop guard) + fallback to `row.value` → Steps 10/12. ✓
  - Registry no-collision routing → Step 14. ✓
  - Seed direction at `scripts/add-hindu-games.mjs:9` + `ON CONFLICT DO NOTHING` note → Step 15. ✓
  - `metric_direction` prod flip, gated, after merge, with pre-flight + restore point → Deploy §3–4. ✓
  - Keep old entries (no delete); Easy Down untouched; gameLinks out of scope → Global Constraints. ✓
  - `always solved:true` accepted-unknown → parser returns `solved:true` (spec-documented); no failed-share handling added. ✓
- **Placeholder scan:** none — every code step shows complete code; commands have expected output.
- **Type consistency:** `detail:{ points }` matches the new `ResultDetail.points?: number` (Step 1); `ResultShape` union gains `"points"` in the same edit that adds the `case` (Step 8); `StatPills` uses `d.points` (typed) and `row.value` (`DailyContestRow.value: number`, confirmed); parser return object matches `ParseResult` exactly (same keys as the old parser, `detail.seconds`→`detail.points`).
