# Hindu Mini + Easy Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two parser-backed timed crossword games — Hindu Mini (`hindu-mini`) and Easy Down (`easy-down`) — so players can log them by sharing/pasting their thehindu.com result, exactly like India Mini.

**Architecture:** Two new timed parsers modeled on `india-mini`, each detected only by its own `thehindu.com` URL path. The min/sec extraction shared by all three timed-crossword parsers is factored into one pure helper `parseDurationSeconds`. Two rows are added to the global `games` catalog at deploy (idempotent insert; no schema migration). Both new parsers set `puzzleNumber: null` and `puzzleDate: null`, so entries file on the log day (accepted limitation — no identifier in the share text).

**Tech Stack:** Next.js 14.2 App Router, TypeScript, Neon stateless `sql` client, Vitest.

## Global Constraints

- **No schema migration.** The global `games` table already exists (columns: `id, name, type, metric_direction, parser_id, has_variants, icon, active, created_at` — NO `group_id`). Adding games = two idempotent `INSERT … ON CONFLICT (id) DO NOTHING` rows at deploy.
- **Both new games are timed, `lower_better`, `type='timed'`, `active=true`, `has_variants=false`, `parser_id = id`.**
- **Detection must not collide.** Each parser matches ONLY its own path: Hindu Mini `thehindu.com/crosswords/thehindu-mini-crossword`; Easy Down `thehindu.com/crosswords/hindu-one-down`. India Mini stays keyed on `indiamini.in`. A routing test proves the three sample texts each resolve to the correct `gameId`.
- **No number/date ⇒ log-day fallback.** Both parsers emit `puzzleNumber: null`, `puzzleDate: null`. Do NOT invent a number or date. (No `[epoch-missing]` warning fires — that is only for numbered games.)
- **Ranking untouched.** `value` (total seconds) + `solved: true` are the only ranking inputs; `detail: { seconds }` is display-only.
- **India Mini behavior unchanged** by the refactor — its existing tests must stay green.
- **Exact sample values:** Hindu Mini `2 minutes and 51 seconds → 171`; Easy Down `3 minutes and 7 seconds → 187`.
- **Do NOT run anything under `scripts/`** — the catalog-insert script is authored here and run only at the gated deploy with owner go-ahead.

---

## File Structure

- **Create** `src/parsers/duration.ts` — pure `parseDurationSeconds` (Task 1).
- **Create** `src/parsers/duration.test.ts` (Task 1).
- **Modify** `src/parsers/indiaMini.ts` — use the shared helper (Task 1).
- **Create** `src/parsers/hinduMini.ts`, `src/parsers/easyDown.ts` + their tests (Task 2).
- **Modify** `src/parsers/registry.ts` — register both (Task 2).
- **Modify** `src/lib/formatResult.ts` — add both to `RESULT_SHAPE` (Task 2).
- **Create/Modify** `src/parsers/registry.test.ts` — routing/no-collision test (Task 2).
- **Create** `scripts/add-hindu-games.mjs` (Task 3 — authored, NOT run).

---

## Task 1: Shared `parseDurationSeconds` helper + refactor India Mini

**Files:**
- Create: `src/parsers/duration.ts`, `src/parsers/duration.test.ts`
- Modify: `src/parsers/indiaMini.ts`

**Interfaces:**
- Produces: `parseDurationSeconds(text: string): number | null` — total seconds from `"X minutes and Y seconds"`, `"X minutes"` (+ optional trailing seconds), or `"Y seconds"`; `null` if no time found.

- [ ] **Step 1: Write the failing test** `src/parsers/duration.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseDurationSeconds } from "./duration";

describe("parseDurationSeconds", () => {
  it("parses 'X minutes and Y seconds'", () => {
    expect(parseDurationSeconds("in 2 minutes and 51 seconds")).toBe(171);
    expect(parseDurationSeconds("in 5 minutes and 20 seconds")).toBe(320);
  });
  it("parses minutes only", () => {
    expect(parseDurationSeconds("in 2 minutes")).toBe(120);
  });
  it("parses seconds only", () => {
    expect(parseDurationSeconds("in 45 seconds")).toBe(45);
  });
  it("handles singular '1 minute and 1 second'", () => {
    expect(parseDurationSeconds("in 1 minute and 1 second")).toBe(61);
  });
  it("returns null when no time is present", () => {
    expect(parseDurationSeconds("no duration here")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/parsers/duration.test.ts`) — no module.

- [ ] **Step 3: Implement `src/parsers/duration.ts`** (the exact logic currently inline in India Mini):
```ts
const MIN_SEC = /(\d+)\s*minutes?\s*(?:and\s*)?(\d+)\s*seconds?/i;
const MIN_ONLY = /(\d+)\s*minutes?/i;
const SEC_ONLY = /(\d+)\s*seconds?/i;

/**
 * Total seconds from a share sentence like "…in X minutes and Y seconds".
 * Handles minutes+seconds, minutes-only (with optional trailing seconds),
 * and seconds-only. Returns null when no time is present. PURE.
 */
export function parseDurationSeconds(text: string): number | null {
  const both = text.match(MIN_SEC);
  if (both) return Number(both[1]) * 60 + Number(both[2]);
  const mins = text.match(MIN_ONLY);
  const secs = text.match(SEC_ONLY);
  if (mins) return Number(mins[1]) * 60 + (secs ? Number(secs[1]) : 0);
  if (secs) return Number(secs[1]);
  return null;
}
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/parsers/duration.test.ts`).

- [ ] **Step 5: Refactor `src/parsers/indiaMini.ts`** to use the helper. Replace the three local regex consts (`MIN_SEC`, `MIN_ONLY`, `SEC_ONLY`) and the inline seconds-computation block with a single call. Keep `MARKER`, the date extraction, the `throw`s, and the returned object EXACTLY as they are. Result:
```ts
import type { Parser, ParseResult } from "./types";
import { parseDurationSeconds } from "./duration";

// India Mini crossword shares a sentence like "…solved this Crossword in
// 5 minutes and 20 seconds…" plus an indiamini.in link (the reliable marker).
const MARKER = /indiamini\.in/i;

export const indiaMiniParser: Parser = {
  gameId: "india-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an India Mini result");
    const seconds = parseDurationSeconds(text);
    if (seconds === null) throw new Error("No time found in India Mini result");
    // Date embedded in the share URL: al-crossword-mini-YYYYMMDD
    const dm = text.match(/al-crossword-mini-(\d{4})(\d{2})(\d{2})/);
    const puzzleDate = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;
    return {
      gameId: "india-mini",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
      puzzleDate,
    };
  },
};
```

- [ ] **Step 6: Run India Mini's existing tests → still PASS** (regression guard): `npx vitest run src/parsers/indiaMini.test.ts` (all existing cases green — the refactor is behavior-preserving).

- [ ] **Step 7: Typecheck + commit.** `npx tsc --noEmit` (0), then:
```bash
git add src/parsers/duration.ts src/parsers/duration.test.ts src/parsers/indiaMini.ts
git commit -m "refactor(parsers): extract parseDurationSeconds; India Mini uses it"
```

---

## Task 2: Hindu Mini + Easy Down parsers, registry, result shape

**Files:**
- Create: `src/parsers/hinduMini.ts`, `src/parsers/hinduMini.test.ts`
- Create: `src/parsers/easyDown.ts`, `src/parsers/easyDown.test.ts`
- Modify: `src/parsers/registry.ts`, `src/lib/formatResult.ts`
- Create/Modify: `src/parsers/registry.test.ts`

**Interfaces:**
- Consumes: `parseDurationSeconds` (Task 1); `Parser`/`ParseResult` from `./types`; `detectAndParse` from `./registry`.
- Produces: `hinduMiniParser` (gameId `hindu-mini`), `easyDownParser` (gameId `easy-down`); both registered in `parsers`.

- [ ] **Step 1: Write the failing parser tests.**
`src/parsers/hinduMini.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hinduMiniParser } from "./hinduMini";

const SAMPLE =
  "I just solved The Hindu Mini in 2 minutes and 51 seconds. Test your wits at [https://www.thehindu.com/crosswords/thehindu-mini-crossword]";

describe("hindu mini parser", () => {
  it("detects its own share link, rejects others", () => {
    expect(hinduMiniParser.detect(SAMPLE)).toBe(true);
    expect(hinduMiniParser.detect("I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down")).toBe(false);
    expect(hinduMiniParser.detect("solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    expect(hinduMiniParser.detect("Wordle 1,234 3/6")).toBe(false);
  });
  it("parses time into total seconds, no number/date", () => {
    expect(hinduMiniParser.parse(SAMPLE)).toEqual({
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: 171,
      solved: true,
      detail: { seconds: 171 },
      puzzleDate: null,
    });
  });
  it("throws on non-matching text", () => {
    expect(() => hinduMiniParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
```
`src/parsers/easyDown.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { easyDownParser } from "./easyDown";

const SAMPLE =
  "I just solved this Crossword in 3 minutes and 7 seconds. Can you beat my time? [https://www.thehindu.com/crosswords/hindu-one-down]";

describe("easy down parser", () => {
  it("detects its own share link, rejects India Mini and Hindu Mini", () => {
    expect(easyDownParser.detect(SAMPLE)).toBe(true);
    // Same "I just solved this Crossword" wording as India Mini — must NOT match India Mini's link
    expect(easyDownParser.detect("I just solved this Crossword in 59 seconds https://indiamini.in/play")).toBe(false);
    expect(easyDownParser.detect("I just solved The Hindu Mini in 2 minutes and 51 seconds. https://www.thehindu.com/crosswords/thehindu-mini-crossword")).toBe(false);
    expect(easyDownParser.detect("Wordle 1,234 3/6")).toBe(false);
  });
  it("parses time into total seconds, no number/date", () => {
    expect(easyDownParser.parse(SAMPLE)).toEqual({
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: 187,
      solved: true,
      detail: { seconds: 187 },
      puzzleDate: null,
    });
  });
  it("throws on non-matching text", () => {
    expect(() => easyDownParser.parse("Wordle 1,234 3/6")).toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/parsers/hinduMini.test.ts src/parsers/easyDown.test.ts`) — no modules.

- [ ] **Step 3: Implement `src/parsers/hinduMini.ts`:**
```ts
import type { Parser, ParseResult } from "./types";
import { parseDurationSeconds } from "./duration";

// The Hindu Mini crossword shares a sentence with a total time and a
// thehindu.com/crosswords/thehindu-mini-crossword link (the reliable marker).
const MARKER = /thehindu\.com\/crosswords\/thehindu-mini-crossword/i;

export const hinduMiniParser: Parser = {
  gameId: "hindu-mini",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not a Hindu Mini result");
    const seconds = parseDurationSeconds(text);
    if (seconds === null) throw new Error("No time found in Hindu Mini result");
    return {
      gameId: "hindu-mini",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
      puzzleDate: null,
    };
  },
};
```

- [ ] **Step 4: Implement `src/parsers/easyDown.ts`:**
```ts
import type { Parser, ParseResult } from "./types";
import { parseDurationSeconds } from "./duration";

// The Hindu "One Down" crossword (shown as "Easy Down") shares a generic
// "I just solved this Crossword…" sentence — worded like India Mini — so the
// thehindu.com/crosswords/hindu-one-down link is the ONLY reliable marker.
const MARKER = /thehindu\.com\/crosswords\/hindu-one-down/i;

export const easyDownParser: Parser = {
  gameId: "easy-down",
  detect(text: string): boolean {
    return MARKER.test(text);
  },
  parse(text: string): ParseResult {
    if (!MARKER.test(text)) throw new Error("Not an Easy Down result");
    const seconds = parseDurationSeconds(text);
    if (seconds === null) throw new Error("No time found in Easy Down result");
    return {
      gameId: "easy-down",
      puzzleNumber: null,
      variant: null,
      value: seconds,
      solved: true,
      detail: { seconds },
      puzzleDate: null,
    };
  },
};
```

- [ ] **Step 5: Run → PASS** (`npx vitest run src/parsers/hinduMini.test.ts src/parsers/easyDown.test.ts`).

- [ ] **Step 6: Register both in `src/parsers/registry.ts`.** Add imports after the `indiaMiniParser` import:
```ts
import { hinduMiniParser } from "./hinduMini";
import { easyDownParser } from "./easyDown";
```
Add both to the `parsers` array (after `indiaMiniParser`):
```ts
  indiaMiniParser,
  hinduMiniParser,
  easyDownParser,
```

- [ ] **Step 7: Add both to `RESULT_SHAPE` in `src/lib/formatResult.ts`** (after the `"india-mini": "timed",` line):
```ts
  "hindu-mini": "timed",
  "easy-down": "timed",
```

- [ ] **Step 8: Write the routing/no-collision test.** If `src/parsers/registry.test.ts` exists, append this `describe`; otherwise create the file with the import header shown:
```ts
import { describe, it, expect } from "vitest";
import { detectAndParse } from "./registry";

describe("detectAndParse routing — thehindu.com vs indiamini.in (no collision)", () => {
  const cases: [string, string][] = [
    ["I just solved this Crossword in 59 seconds https://indiamini.in/play/?id=al-crossword-mini-20260702", "india-mini"],
    ["I just solved The Hindu Mini in 2 minutes and 51 seconds. https://www.thehindu.com/crosswords/thehindu-mini-crossword", "hindu-mini"],
    ["I just solved this Crossword in 3 minutes and 7 seconds. https://www.thehindu.com/crosswords/hindu-one-down", "easy-down"],
  ];
  for (const [text, gameId] of cases) {
    it(`routes to ${gameId}`, () => {
      expect(detectAndParse(text)?.gameId).toBe(gameId);
    });
  }
});
```

- [ ] **Step 9: Run → PASS**, `npx tsc --noEmit` (0), full suite `npx vitest run`.

- [ ] **Step 10: Commit**
```bash
git add src/parsers/hinduMini.ts src/parsers/hinduMini.test.ts src/parsers/easyDown.ts src/parsers/easyDown.test.ts src/parsers/registry.ts src/parsers/registry.test.ts src/lib/formatResult.ts
git commit -m "feat(parsers): add Hindu Mini + Easy Down timed crosswords"
```

---

## Task 3: Authored catalog-insert script (NOT run)

**Files:**
- Create: `scripts/add-hindu-games.mjs`

**Interfaces:**
- A thin `.mjs` runner (authored, NOT run here) that idempotently inserts the two `games` rows on prod at the gated deploy.

- [ ] **Step 1: Author `scripts/add-hindu-games.mjs`** — model it on the neon-client style of `scripts/backfill-puzzle-dates.mjs` (imports `neon` from `@neondatabase/serverless`, reads `process.env.DATABASE_URL`, run via `tsx`). It inserts exactly the two rows into the GLOBAL `games` table (no `group_id` column) and is idempotent:
```js
// One-time: add the Hindu Mini + Easy Down games to the global catalog.
// Idempotent (ON CONFLICT DO NOTHING). Touches only the games table.
// Run at the gated deploy:  set -a && . ./.env.local && set +a && npx tsx scripts/add-hindu-games.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
// [id, name, type, metric_direction, parser_id, has_variants]
const games = [
  ["hindu-mini", "Hindu Mini", "timed", "lower_better", "hindu-mini", false],
  ["easy-down", "Easy Down", "timed", "lower_better", "easy-down", false],
];
for (const [id, name, type, dir, parserId, hasVariants] of games) {
  await sql`INSERT INTO games (id, name, type, metric_direction, parser_id, has_variants, active)
    VALUES (${id}, ${name}, ${type}, ${dir}, ${parserId}, ${hasVariants}, true)
    ON CONFLICT (id) DO NOTHING`;
}
const rows = await sql`SELECT id, name, active FROM games WHERE id IN ('hindu-mini','easy-down') ORDER BY id`;
console.log("games present:", JSON.stringify(rows));
```

- [ ] **Step 2: Verify + commit.** `npx tsc --noEmit` (0), `npm run build`, `npx vitest run` (all pass). Do NOT run the script.
```bash
git add scripts/add-hindu-games.mjs
git commit -m "chore(deploy): idempotent script to add Hindu Mini + Easy Down to games catalog"
```

---

## Deploy (gated — owner go-ahead; no schema migration)

1. Backup tag on `main` + note a Neon PITR point.
2. Merge the code (Tasks 1–3) → prod auto-deploys.
3. `set -a && . ./.env.local && set +a && npx tsx scripts/add-hindu-games.mjs` against prod → confirm both rows present + active.
4. Verify: prod site 200; the two games appear on the Global board / in the Log game picker.
Nothing to prod without explicit go-ahead.

## Out of scope

- Adding these games to any specific private group (group admins do it in-app).
- Touching the stale `scripts/seed.mjs` (references the dropped `g1`/`group_id`).
- Icon art (`icon` left null, as with every other game).

## Self-Review

- **Spec coverage:** detection-by-URL + no-collision routing test (Task 2 Steps 1/8); shared `parseDurationSeconds` + India Mini refactor (Task 1); two parsers with `puzzleNumber:null`/`puzzleDate:null` (Task 2); `RESULT_SHAPE` entries (Task 2 Step 7); catalog rows via idempotent script (Task 3 + Deploy); log-day limitation is inherent (no number/date emitted). ✓
- **Placeholder scan:** none — every code/test/command block is concrete with exact values (171, 187, gameIds, markers).
- **Type consistency:** `parseDurationSeconds(text): number | null` used identically in India Mini and both new parsers; both parsers return the `ParseResult` shape (`gameId, puzzleNumber, variant, value, solved, detail, puzzleDate`) matching `src/parsers/types.ts`; `RESULT_SHAPE` keys (`hindu-mini`, `easy-down`) match the game ids and the `games.id` inserted by the script.
