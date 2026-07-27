# B008 — Easy Down: time → points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Easy Down auto-log after The Hindu changed its share from a TIME to a POINTS score (higher = better) — the exact twin of the already-shipped B007 (Hindu Mini), scoped to `easy-down`.

**Architecture:** Rewrite the `easy-down` parser (new URL marker + score parse), remap its display shape to the `"points"` shape that already exists from B007, and flip its `metric_direction` (seed line + a gated prod `UPDATE`). No new display/type infrastructure — B007 already added the `"points"` `ResultShape`, the `formatResult`/`StatPills` cases, and `ResultDetail.points`.

**Tech Stack:** TypeScript, Vitest, Neon (parser + one display-map line; the scoring flip is a DB `UPDATE` at deploy).

## Global Constraints

- **Reuse B007 infra** — do NOT re-add the `"points"` `ResultShape`, the `formatResult` `"points"` case, the `StatPills` `"points"` case, or `ResultDetail.points`. They already exist on `main`.
- **Keep old time-based Easy Down entries** — no data deletion (owner accepts the 2 historical multi-player days 07-13 / 07-16 having their winner invert).
- **Hindu Mini untouched** (already fixed in B007); **`games.type` stays `"timed"`**; **`gameLinks.ts` play-URL out of scope** (flagged only).
- **No schema migration.** Parser stays registered in `src/parsers/registry.ts` (order unchanged: hinduMini → easyDown; markers disjoint, no collision).
- Board display everywhere: `` `${value} pts` ``.
- **Prod DB change is deploy-time only:** `UPDATE games SET metric_direction='higher_better' WHERE id='easy-down'`, after merge, with a read-only pre-flight + Neon restore point + owner go-ahead. Nothing merges/touches prod without owner go-ahead.

---

## Task 1: Easy Down points parser + display shape + seed

**Files:**
- Modify: `src/parsers/easyDown.ts` (rewrite parser)
- Test: `src/parsers/easyDown.test.ts` (rewrite for the new format)
- Modify: `src/lib/formatResult.ts:20` (remap `easy-down` shape)
- Test: `src/lib/formatResult.test.ts` (add easy-down points cases)
- Test: `src/parsers/registry.test.ts:47` (update the stale easy-down routing sample)
- Modify: `scripts/add-hindu-games.mjs:10` (seed direction)

**Interfaces:**
- Produces: `easyDownParser.parse(text)` → `{ gameId:"easy-down", puzzleNumber:null, variant:null, value:<points>, solved:true, detail:{ points:<points> }, puzzleDate:null }`.
- Consumes (already on `main` from B007): `ResultShape "points"`; `formatResult` `"points"` case → `` `${value} pts` ``; `StatPills` `"points"` case → `` `${d.points ?? row.value} pts` ``; `ResultDetail.points?: number`.

### Steps

- [ ] **Step 1: Rewrite the parser test (RED).**

Replace the entire contents of `src/parsers/easyDown.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { easyDownParser } from "./easyDown";

const SAMPLE =
  "I scored 69 on this Crossword. Think you can do better? https://www.thehindu.com/?id=sdfoioe&set=hindu-one-down&puzzleType=crossword";

describe("easy down parser (points format)", () => {
  it("detects the new set=hindu-one-down link, rejects others", () => {
    expect(easyDownParser.detect(SAMPLE)).toBe(true);
    // Hindu Mini's new-style link (different set= value) — no collision
    expect(
      easyDownParser.detect(
        "I scored 141 on this Crossword. https://www.thehindu.com/?id=abc&set=thehindu-mini-crossword&puzzleType=crossword",
      ),
    ).toBe(false);
    // India Mini
    expect(easyDownParser.detect("solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    // OLD time-format Easy Down link is no longer detected (that era is retired)
    expect(
      easyDownParser.detect(
        "I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down",
      ),
    ).toBe(false);
    expect(easyDownParser.detect("Wordle 1,234 3/6")).toBe(false);
  });

  it("parses the score into value + detail.points, no number/date", () => {
    expect(easyDownParser.parse(SAMPLE)).toEqual({
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: 69,
      solved: true,
      detail: { points: 69 },
      puzzleDate: null,
    });
  });

  it("handles comma-formatted scores", () => {
    const s =
      "I scored 1,234 on this Crossword. https://www.thehindu.com/?id=z&set=hindu-one-down&puzzleType=crossword";
    expect(easyDownParser.parse(s).value).toBe(1234);
  });

  it("throws when the marker matches but no score is present", () => {
    const s =
      "I finished this Crossword! https://www.thehindu.com/?id=z&set=hindu-one-down&puzzleType=crossword";
    expect(() => easyDownParser.parse(s)).toThrow();
  });

  it("throws on non-matching text", () => {
    expect(() => easyDownParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
```

- [ ] **Step 2: Run the parser test → FAIL.**

Run: `npx vitest run src/parsers/easyDown.test.ts`
Expected: FAIL — the current parser detects the old `/crosswords/hindu-one-down` URL and parses a time, so the new-format detect/parse assertions fail.

- [ ] **Step 3: Rewrite the parser (GREEN).**

Replace the entire contents of `src/parsers/easyDown.ts` with:

```ts
import type { Parser, ParseResult } from "./types";

// The Hindu "One Down" (shown as "Easy Down") now shares an "I scored N on
// this Crossword…" sentence with a thehindu.com/?…&set=hindu-one-down&… link.
// The `set=hindu-one-down` query param is the reliable marker (the old
// /crosswords/ path is gone). Score is points, higher is better. PURE.
const MARKER = /set=hindu-one-down/i;
const SCORE = /scored\s+([\d,]+)/i;

export const easyDownParser: Parser = {
  gameId: "easy-down",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an Easy Down result");
    const m = SCORE.exec(text);
    if (!m) throw new Error("No score found in Easy Down result");
    const points = parseInt(m[1].replace(/,/g, ""), 10);
    return {
      gameId: "easy-down",
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

(Note: the `import { parseDurationSeconds } from "./duration"` is gone — the new file has no duration import.)

- [ ] **Step 4: Run the parser test → PASS.**

Run: `npx vitest run src/parsers/easyDown.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Update the stale registry routing sample.**

Rewriting the parser makes the pre-existing easy-down routing case (which uses the retired `/crosswords/hindu-one-down` URL) no longer detected. In `src/parsers/registry.test.ts`, line ~47, replace:

```ts
    ["I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down", "easy-down"],
```

with the new-format sample:

```ts
    ["I scored 69 on this Crossword. Think you can do better? https://www.thehindu.com/?id=sdfoioe&set=hindu-one-down&puzzleType=crossword", "easy-down"],
```

Keep every other case in that file unchanged (the india-mini and hindu-mini samples still route correctly).

Run: `npx vitest run src/parsers/registry.test.ts`
Expected: PASS — the Easy Down sample routes to `easy-down`; no collision with `hindu-mini` / `india-mini`.

- [ ] **Step 6: Add the `formatResult` points cases (RED).**

In `src/lib/formatResult.test.ts`, add to the `shapeForGame` "maps each game" `it` (after the existing assertions):

```ts
    expect(shapeForGame("easy-down")).toBe("points");
```

And add a new `it` inside the `formatResult` `describe`:

```ts
  it("Points -> N pts (Easy Down)", () => {
    expect(formatResult("easy-down", 69, true)).toBe("69 pts");
  });
```

- [ ] **Step 7: Run → FAIL.**

Run: `npx vitest run src/lib/formatResult.test.ts`
Expected: FAIL — `easy-down` is still mapped to `"timed"`, so `shapeForGame("easy-down")` returns `"timed"` and `formatResult("easy-down",69,true)` returns `"1:09"`, not `"69 pts"`.

- [ ] **Step 8: Remap the shape (GREEN).**

In `src/lib/formatResult.ts`, change line ~20 from:

```ts
  "easy-down": "timed",
```
to:
```ts
  "easy-down": "points",
```

(Do NOT touch the `ResultShape` union or the `switch` — both already carry `"points"` from B007.)

- [ ] **Step 9: Run → PASS.**

Run: `npx vitest run src/lib/formatResult.test.ts`
Expected: PASS.

- [ ] **Step 10: Update the local seed direction.**

In `scripts/add-hindu-games.mjs` line 10, change the easy-down row's direction from `"lower_better"` to `"higher_better"`:

```js
  ["easy-down", "Easy Down", "timed", "higher_better", "easy-down", false],
```

(Do NOT change line 9 — hindu-mini is already `higher_better` from B007. This script uses `ON CONFLICT (id) DO NOTHING`, so re-running it will NOT update the existing prod row — the manual `UPDATE` at deploy is what flips prod.)

- [ ] **Step 11: Typecheck, full suite, build.**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npx vitest run`
Expected: all tests pass.

Run: `npm run build`
Expected: build completes.

- [ ] **Step 12: Commit.**

```bash
git add src/parsers/easyDown.ts src/parsers/easyDown.test.ts \
        src/lib/formatResult.ts src/lib/formatResult.test.ts \
        src/parsers/registry.test.ts scripts/add-hindu-games.mjs
git commit -m "fix(easy-down): parse points score + higher-better display (B008)"
```

---

## Deploy (gated — owner go-ahead)

Code + one prod row `UPDATE`, single gated window (identical shape to B007):

1. **Backup:** tag `pre-b008-easy-down-points` on `origin/main`; note a Neon PITR timestamp before the DB write.
2. **Ship code:** PR → CI `verify` → owner approves → squash-merge.
3. **Prod DB pre-flight (read-only):** `SELECT id, name, metric_direction FROM games WHERE id='easy-down';` — show the current row (`lower_better`).
4. **Flip direction (owner go-ahead):** `UPDATE games SET metric_direction='higher_better' WHERE id='easy-down';` — run immediately after merge; confirm 1 row updated; re-read to verify.
5. **Verify on prod:** log the owner's "I scored 69 …" sample — it parses, logs, shows `69 pts`, and ranks higher-better.

## Self-Review

- **Spec coverage:**
  - Parser new marker + comma-safe score → Steps 1/3 (`/set=hindu-one-down/i`, `/scored\s+([\d,]+)/i`, strip+parseInt). ✓
  - Display remap only (reuse B007 shape/case) → Step 8 (`RESULT_SHAPE["easy-down"]="points"`); no ResultShape/switch/StatPills/types edits. ✓
  - Registry stale-sample fix → Step 5. ✓
  - Seed direction at line 10 + `ON CONFLICT DO NOTHING` note → Step 10. ✓
  - `metric_direction` prod flip, gated, after merge, pre-flight + restore point → Deploy §3–4. ✓
  - Keep old entries (no delete); Hindu Mini untouched; games.type stays "timed"; gameLinks out of scope → Global Constraints. ✓
  - No collision (routes to easy-down) → Step 1 detect assertions + Step 5 registry case. ✓
- **Placeholder scan:** none — every code step shows complete code; commands have expected output.
- **Type consistency:** `detail:{ points }` matches `ResultDetail.points` (on `main`); parser return matches `ParseResult` (same keys as the pre-B008 parser, `detail.seconds`→`detail.points`); `RESULT_SHAPE["easy-down"]="points"` is a valid `ResultShape` value that both renderers already handle.
