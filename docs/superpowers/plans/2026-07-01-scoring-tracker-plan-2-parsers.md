# Scoring Tracker — Plan 2: Full Parser Set + Manual Fallback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-parsers for the games we have real share-text for (Pips, Connections, Minute Cryptic, and the LinkedIn timed games Queens/Tango/Mini Sudoku), plus a manual-entry path so *every* configured game is loggable — with adding a new game reduced to a config row (± one small parser module).

**Architecture:** Extends the Plan 1 parser registry (pure `detect`/`parse` functions) with new game modules and a reusable LinkedIn-timed parser factory. A pure `resolveSubmission` helper unifies the paste and manual input modes so the entries route has one code path after it. Games are DB rows (Plan 1 schema already supports this), seeded broadly so games without a parser still work via manual entry. A `GET /api/games` endpoint feeds the manual-entry UI.

**Tech Stack:** Same as Plan 1 — Next.js (App Router, TS), Vitest, `@neondatabase/serverless`. No new dependencies.

## Global Constraints

- **Parsers are pure:** no DB, env, I/O, `Date`, or `Math.random`. A parser is `{ gameId, detect(text): boolean, parse(text): ParseResult }`; `ParseResult = { gameId, puzzleNumber: number|null, variant: string|null, value: number, solved: boolean }`. These types already exist in `src/parsers/types.ts` — import, don't redefine.
- **`detectAndParse` never throws** (returns `null` on no-match or parser throw). It already accepts an optional parser-list param: `detectAndParse(text, list = parsers)` — use that param in tests, never mutate the module `parsers` array.
- **Game id consistency:** a parser's `gameId` MUST equal the `games.id` seeded for it. Ids used here: `wordle`, `pips`, `connections`, `minute-cryptic`, `queens`, `tango`, `mini-sudoku`.
- **Metric semantics:** timed games store `parsed_value` in **seconds** (lower better); outcome games store the relevant count (guesses/mistakes/hints, lower better). Minute Cryptic ranks by **hints used** (fewest wins).
- **Difficulty = variant:** Pips uses `variant` ∈ {`easy`,`medium`,`hard`} (lowercase). Winner grouping is already `(gameId, variant, puzzleKey)` in `src/scoring/wins.ts`.
- **Node runtime** on every route (`export const runtime = "nodejs"`), server-side auth before data access, parameterized SQL, no `dangerouslySetInnerHTML`, append-only entries — all per Plan 1; do not regress them.
- **TDD:** every code task is failing test → run (fail) → minimal impl → run (pass) → commit. Pure modules are fully unit-tested; route/UI wiring is verified by `npm run build` + the documented live smoke test (Neon is provisioned; `.env.local` holds `DATABASE_URL`/`AUTH_SECRET`).
- **DB-touching modules must not be imported into statically-rendered paths** (keeps `next build` from needing `DATABASE_URL`). API routes are dynamic — fine.

---

### Task 1: `parseClock` time helper

**Files:**
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `parseClock(input: string): number | null` — converts `"m:ss"`, `"h:mm:ss"`, or plain seconds (`"45"`) to total seconds; returns `null` for malformed input. Consumed by the Pips parser (Task 2), the LinkedIn factory (Task 5), and the manual-entry UI (Task 10).

- [ ] **Step 1: Write the failing test**

`src/lib/time.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseClock } from "./time";

describe("parseClock", () => {
  it("parses m:ss", () => {
    expect(parseClock("9:53")).toBe(593);
    expect(parseClock("0:31")).toBe(31);
    expect(parseClock("1:20")).toBe(80);
  });
  it("parses h:mm:ss", () => {
    expect(parseClock("1:02:03")).toBe(3723);
  });
  it("parses plain seconds", () => {
    expect(parseClock("45")).toBe(45);
  });
  it("trims surrounding whitespace", () => {
    expect(parseClock("  0:38  ")).toBe(38);
  });
  it("returns null for malformed input", () => {
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("1:")).toBeNull();
    expect(parseClock("1:2:3:4")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- time`
Expected: FAIL — cannot find module `./time`.

- [ ] **Step 3: Implement**

`src/lib/time.ts`:
```ts
// Parse "m:ss", "h:mm:ss", or plain seconds into a total number of seconds.
// Returns null for anything malformed.
export function parseClock(input: string): number | null {
  const s = input.trim();
  if (s.length === 0) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- time`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: parseClock time helper (m:ss/h:mm:ss/seconds)"
```

---

### Task 2: Pips parser

**Files:**
- Create: `src/parsers/pips.ts`
- Test: `src/parsers/pips.test.ts`

**Interfaces:**
- Consumes: `Parser`/`ParseResult` (`src/parsers/types.ts`), `parseClock` (Task 1).
- Produces: `pipsParser: Parser` with `gameId: "pips"`. Registered in Task 6.

- [ ] **Step 1: Write the failing test**

`src/parsers/pips.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pipsParser } from "./pips";

describe("pips parser", () => {
  it("detects Pips share text", () => {
    expect(pipsParser.detect("Pips #317 Hard 🔴\n9:53")).toBe(true);
    expect(pipsParser.detect("Wordle 1,838 3/6")).toBe(false);
  });
  it("parses a Hard result with time in seconds and lowercased variant", () => {
    expect(pipsParser.parse("Pips #317 Hard 🔴\n9:53")).toEqual({
      gameId: "pips",
      puzzleNumber: 317,
      variant: "hard",
      value: 593,
      solved: true,
    });
  });
  it("parses an Easy result", () => {
    expect(pipsParser.parse("Pips #317 Easy 🟢\n1:20")).toEqual({
      gameId: "pips",
      puzzleNumber: 317,
      variant: "easy",
      value: 80,
      solved: true,
    });
  });
  it("throws on non-Pips text", () => {
    expect(() => pipsParser.parse("hello")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pips`
Expected: FAIL — cannot find module `./pips`.

- [ ] **Step 3: Implement**

`src/parsers/pips.ts`:
```ts
import type { Parser, ParseResult } from "./types";
import { parseClock } from "@/lib/time";

const HEADER = /^Pips\s+#(\d+)\s+(Easy|Medium|Hard)/im;
const CLOCK = /(\d+:\d{2})/;

export const pipsParser: Parser = {
  gameId: "pips",
  detect(text: string): boolean {
    return HEADER.test(text);
  },
  parse(text: string): ParseResult {
    const h = text.match(HEADER);
    if (!h) throw new Error("Not a Pips result");
    const c = text.match(CLOCK);
    const value = c ? parseClock(c[1]) : null;
    if (value === null) throw new Error("No valid Pips time");
    return {
      gameId: "pips",
      puzzleNumber: Number(h[1]),
      variant: h[2].toLowerCase(),
      value,
      solved: true,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pips`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/pips.ts src/parsers/pips.test.ts
git commit -m "feat: Pips parser (difficulty variant + time in seconds)"
```

---

### Task 3: Connections parser

**Files:**
- Create: `src/parsers/connections.ts`
- Test: `src/parsers/connections.test.ts`

**Interfaces:**
- Consumes: `Parser`/`ParseResult`.
- Produces: `connectionsParser: Parser` with `gameId: "connections"`. Registered in Task 6.

Scoring: value = **mistakes** = count of guess rows that are NOT all one color. `solved` = exactly 4 monochrome rows were reached (all groups found). A guess row is a line containing exactly 4 color squares.

- [ ] **Step 1: Write the failing test**

`src/parsers/connections.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { connectionsParser } from "./connections";

const SOLVED = `Connections
Puzzle #1116
🟩🟦🟪🟪
🟦🟨🟨🟨
🟨🟨🟨🟨
🟩🟩🟩🟩
🟦🟦🟦🟦
🟪🟪🟪🟪`;

const FAILED = `Connections
Puzzle #1117
🟩🟦🟪🟨
🟦🟨🟨🟨
🟩🟦🟪🟨
🟦🟨🟩🟪
🟨🟨🟨🟨`;

describe("connections parser", () => {
  it("detects Connections share text", () => {
    expect(connectionsParser.detect(SOLVED)).toBe(true);
    expect(connectionsParser.detect("Wordle 1,838 3/6")).toBe(false);
  });
  it("counts mistakes and marks solved when all four groups are found", () => {
    expect(connectionsParser.parse(SOLVED)).toEqual({
      gameId: "connections",
      puzzleNumber: 1116,
      variant: null,
      value: 2,
      solved: true,
    });
  });
  it("marks unsolved when fewer than four groups are found", () => {
    // 4 mixed rows + 1 mono row => mono=1, mistakes=4, not solved
    expect(connectionsParser.parse(FAILED)).toEqual({
      gameId: "connections",
      puzzleNumber: 1117,
      variant: null,
      value: 4,
      solved: false,
    });
  });
  it("throws on non-Connections text", () => {
    expect(() => connectionsParser.parse("hello")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- connections`
Expected: FAIL — cannot find module `./connections`.

- [ ] **Step 3: Implement**

`src/parsers/connections.ts`:
```ts
import type { Parser, ParseResult } from "./types";

const HEADER = /^Connections/im;
const PUZZLE = /Puzzle #(\d+)/i;
const SQUARE = /[🟩🟦🟪🟨🟧🟥]/gu;

export const connectionsParser: Parser = {
  gameId: "connections",
  detect(text: string): boolean {
    return HEADER.test(text) && PUZZLE.test(text);
  },
  parse(text: string): ParseResult {
    const p = text.match(PUZZLE);
    if (!p) throw new Error("Not a Connections result");
    const rows = text
      .split("\n")
      .map((line) => [...line.matchAll(SQUARE)].map((m) => m[0]))
      .filter((squares) => squares.length === 4);
    if (rows.length === 0) throw new Error("No Connections grid found");
    const mono = rows.filter((r) => r.every((c) => c === r[0])).length;
    return {
      gameId: "connections",
      puzzleNumber: Number(p[1]),
      variant: null,
      value: rows.length - mono,
      solved: mono === 4,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- connections`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/connections.ts src/parsers/connections.test.ts
git commit -m "feat: Connections parser (mistakes + solved detection)"
```

---

### Task 4: Minute Cryptic parser

**Files:**
- Create: `src/parsers/minuteCryptic.ts`
- Test: `src/parsers/minuteCryptic.test.ts`

**Interfaces:**
- Consumes: `Parser`/`ParseResult`.
- Produces: `minuteCrypticParser: Parser` with `gameId: "minute-cryptic"`. Registered in Task 6.

Scoring: value = **hints used** (the `N hints` number, default 0), `solved` = trophy 🏆 present or the word "solvers" present. No puzzle number (dated game) → `puzzleNumber: null` (keyed by submission day downstream).

- [ ] **Step 1: Write the failing test**

`src/parsers/minuteCryptic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { minuteCrypticParser } from "./minuteCryptic";

const SAMPLE = `Minute Cryptic - 1 July, 2026
"Overly bright veils spurned by glum bride" (5)
🟣🟣🟣🟣🟣🟣🟣🟣
🏆 0 hints – 3 under the community par (40,185 solvers so far).
https://www.minutecryptic.com/?utm_source=share`;

describe("minute cryptic parser", () => {
  it("detects Minute Cryptic share text", () => {
    expect(minuteCrypticParser.detect(SAMPLE)).toBe(true);
    expect(minuteCrypticParser.detect("Wordle 1,838 3/6")).toBe(false);
  });
  it("parses hints used and marks solved, with no puzzle number", () => {
    expect(minuteCrypticParser.parse(SAMPLE)).toEqual({
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: 0,
      solved: true,
    });
  });
  it("parses a non-zero hint count", () => {
    const r = minuteCrypticParser.parse(
      "Minute Cryptic - 2 July, 2026\n🏆 2 hints – at the community par",
    );
    expect(r.value).toBe(2);
    expect(r.solved).toBe(true);
  });
  it("throws on non-Minute-Cryptic text", () => {
    expect(() => minuteCrypticParser.parse("hello")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- minuteCryptic`
Expected: FAIL — cannot find module `./minuteCryptic`.

- [ ] **Step 3: Implement**

`src/parsers/minuteCryptic.ts`:
```ts
import type { Parser, ParseResult } from "./types";

const HEADER = /^Minute Cryptic/im;
const HINTS = /(\d+)\s+hints?/i;

export const minuteCrypticParser: Parser = {
  gameId: "minute-cryptic",
  detect(text: string): boolean {
    return HEADER.test(text);
  },
  parse(text: string): ParseResult {
    if (!HEADER.test(text)) throw new Error("Not a Minute Cryptic result");
    const h = text.match(HINTS);
    return {
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: h ? Number(h[1]) : 0,
      solved: /🏆/u.test(text) || /solvers/i.test(text),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- minuteCryptic`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/minuteCryptic.ts src/parsers/minuteCryptic.test.ts
git commit -m "feat: Minute Cryptic parser (hints used, dated puzzle)"
```

---

### Task 5: LinkedIn timed parser factory (Queens, Tango, Mini Sudoku)

**Files:**
- Create: `src/parsers/linkedin.ts`
- Test: `src/parsers/linkedin.test.ts`

**Interfaces:**
- Consumes: `Parser`/`ParseResult`, `parseClock` (Task 1).
- Produces:
  - `makeLinkedInTimedParser(gameId: string, displayName: string): Parser` — factory for LinkedIn games that share `<Name> #<n>` followed by an `m:ss` time (separator-agnostic).
  - `queensParser`, `tangoParser`, `miniSudokuParser` (gameIds `queens`, `tango`, `mini-sudoku`). Registered in Task 6.

This factory is the documented extension point: a new LinkedIn timed game (Zip, Crossclimb) is one `makeLinkedInTimedParser(...)` line once its share format is confirmed.

- [ ] **Step 1: Write the failing test**

`src/parsers/linkedin.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { queensParser, tangoParser, miniSudokuParser } from "./linkedin";

describe("linkedin timed parsers", () => {
  it("parses Queens (newline separator)", () => {
    expect(queensParser.parse("Queens #792\n0:31 👑\nlnkd.in/queens.")).toEqual({
      gameId: "queens",
      puzzleNumber: 792,
      variant: null,
      value: 31,
      solved: true,
    });
  });
  it("parses Tango", () => {
    expect(tangoParser.parse("Tango #632\n0:23 🌗\nlnkd.in/tango.")).toEqual({
      gameId: "tango",
      puzzleNumber: 632,
      variant: null,
      value: 23,
      solved: true,
    });
  });
  it("parses Mini Sudoku (pipe separator, same line)", () => {
    expect(
      miniSudokuParser.parse("Mini Sudoku #324 | 0:38 ✏️\nlnkd.in/minisudoku."),
    ).toEqual({
      gameId: "mini-sudoku",
      puzzleNumber: 324,
      variant: null,
      value: 38,
      solved: true,
    });
  });
  it("each parser only detects its own game", () => {
    expect(queensParser.detect("Tango #632\n0:23")).toBe(false);
    expect(tangoParser.detect("Queens #792\n0:31")).toBe(false);
    expect(miniSudokuParser.detect("Queens #792\n0:31")).toBe(false);
  });
  it("throws on non-matching text", () => {
    expect(() => queensParser.parse("Wordle 1,838 3/6")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- linkedin`
Expected: FAIL — cannot find module `./linkedin`.

- [ ] **Step 3: Implement**

`src/parsers/linkedin.ts`:
```ts
import type { Parser, ParseResult } from "./types";
import { parseClock } from "@/lib/time";

const CLOCK = /(\d+:\d{2})/;

// LinkedIn timed games share "<Name> #<n>" followed by an m:ss time.
// The separator varies (newline for Queens/Tango, " | " for Mini Sudoku),
// so we match the header and then find the first clock anywhere in the text.
export function makeLinkedInTimedParser(gameId: string, displayName: string): Parser {
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
      return { gameId, puzzleNumber: Number(h[1]), variant: null, value, solved: true };
    },
  };
}

export const queensParser = makeLinkedInTimedParser("queens", "Queens");
export const tangoParser = makeLinkedInTimedParser("tango", "Tango");
export const miniSudokuParser = makeLinkedInTimedParser("mini-sudoku", "Mini Sudoku");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- linkedin`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/linkedin.ts src/parsers/linkedin.test.ts
git commit -m "feat: reusable LinkedIn timed parser (Queens, Tango, Mini Sudoku)"
```

---

### Task 6: Register all parsers + routing test

**Files:**
- Modify: `src/parsers/registry.ts`
- Test: `src/parsers/registry.test.ts` (extend existing)

**Interfaces:**
- Consumes: all parsers from Tasks 2–5.
- Produces: an updated `parsers` array; `detectAndParse` unchanged in signature.

- [ ] **Step 1: Write the failing test additions**

Append to `src/parsers/registry.test.ts` (inside the existing `describe`, or a new one):
```ts
import { pipsParser } from "./pips";
import { connectionsParser } from "./connections";
import { minuteCrypticParser } from "./minuteCryptic";
import { queensParser } from "./linkedin";

describe("detectAndParse routes every known game", () => {
  const cases: [string, string, string][] = [
    ["wordle", "Wordle 1,838 3/6", "wordle"],
    ["pips", "Pips #317 Hard 🔴\n9:53", "pips"],
    ["connections", "Connections\nPuzzle #1116\n🟨🟨🟨🟨\n🟩🟩🟩🟩\n🟦🟦🟦🟦\n🟪🟪🟪🟪", "connections"],
    ["minute-cryptic", "Minute Cryptic - 1 July, 2026\n🏆 0 hints", "minute-cryptic"],
    ["queens", "Queens #792\n0:31 👑", "queens"],
    ["tango", "Tango #632\n0:23 🌗", "tango"],
    ["mini-sudoku", "Mini Sudoku #324 | 0:38 ✏️", "mini-sudoku"],
  ];
  it.each(cases)("routes %s text to the right parser", (_label, text, expectedGameId) => {
    expect(detectAndParse(text)?.gameId).toBe(expectedGameId);
  });
});
```
(Keep the existing `detectAndParse` tests. Ensure `pipsParser` etc. imports don't clash with any existing import — add only what's missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- registry`
Expected: FAIL — non-Wordle cases return `undefined`/`null` (parsers not registered yet).

- [ ] **Step 3: Update the registry**

`src/parsers/registry.ts`:
```ts
import type { Parser, ParseResult } from "./types";
import { wordleParser } from "./wordle";
import { pipsParser } from "./pips";
import { connectionsParser } from "./connections";
import { minuteCrypticParser } from "./minuteCryptic";
import { queensParser, tangoParser, miniSudokuParser } from "./linkedin";

export const parsers: Parser[] = [
  wordleParser,
  pipsParser,
  connectionsParser,
  minuteCrypticParser,
  queensParser,
  tangoParser,
  miniSudokuParser,
];

export function detectAndParse(
  text: string,
  list: Parser[] = parsers,
): ParseResult | null {
  const parser = list.find((p) => p.detect(text));
  if (!parser) return null;
  try {
    return parser.parse(text);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- registry`
Expected: PASS (all routing cases + existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/registry.ts src/parsers/registry.test.ts
git commit -m "feat: register Pips/Connections/MinuteCryptic/LinkedIn parsers"
```

---

### Task 7: `resolveSubmission` — unify paste + manual input (pure)

**Files:**
- Create: `src/lib/submission.ts`
- Test: `src/lib/submission.test.ts`

**Interfaces:**
- Consumes: `detectAndParse` (registry), `ParseResult`.
- Produces:
  - `ResolvedSubmission = { gameId, variant: string|null, value: number, solved: boolean, puzzleNumber: number|null, rawInput: string|null }`.
  - `SubmissionError = { error: string; status: number }`.
  - `resolveSubmission(body: unknown, detect?): ResolvedSubmission | SubmissionError` — paste mode when `body.rawInput` is a non-empty string (runs `detect`; 422 if unparseable); manual mode when `gameId`+numeric `value`+boolean `solved` are present; else 400. Consumed by the entries route (Task 8).

- [ ] **Step 1: Write the failing test**

`src/lib/submission.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveSubmission } from "./submission";

describe("resolveSubmission", () => {
  it("paste mode: parses recognized share text", () => {
    const r = resolveSubmission({ rawInput: "Wordle 1,838 3/6" });
    expect(r).toEqual({
      gameId: "wordle", puzzleNumber: 1838, variant: null,
      value: 3, solved: true, rawInput: "Wordle 1,838 3/6",
    });
  });
  it("paste mode: 422 when unparseable", () => {
    expect(resolveSubmission({ rawInput: "unrecognizable text" })).toEqual({
      error: "Could not parse result", status: 422,
    });
  });
  it("manual mode: accepts explicit fields", () => {
    const r = resolveSubmission({ gameId: "nyt-mini", variant: null, value: 42, solved: true });
    expect(r).toEqual({
      gameId: "nyt-mini", variant: null, value: 42, solved: true,
      puzzleNumber: null, rawInput: null,
    });
  });
  it("manual mode: normalizes empty variant to null", () => {
    const r = resolveSubmission({ gameId: "pips", variant: "", value: 90, solved: true });
    expect((r as any).variant).toBeNull();
  });
  it("400 when neither paste nor a valid manual payload is present", () => {
    expect(resolveSubmission({})).toEqual({ error: "Missing or invalid fields", status: 400 });
    expect(resolveSubmission({ gameId: "x", value: "notnum", solved: true }))
      .toEqual({ error: "Missing or invalid fields", status: 400 });
  });
  it("uses an injected detector (no registry dependency in the test)", () => {
    const fake = () => ({ gameId: "g", puzzleNumber: 1, variant: null, value: 5, solved: true });
    const r = resolveSubmission({ rawInput: "anything" }, fake);
    expect((r as any).gameId).toBe("g");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- submission`
Expected: FAIL — cannot find module `./submission`.

- [ ] **Step 3: Implement**

`src/lib/submission.ts`:
```ts
import { detectAndParse } from "@/parsers/registry";
import type { ParseResult } from "@/parsers/types";

export interface ResolvedSubmission {
  gameId: string;
  variant: string | null;
  value: number;
  solved: boolean;
  puzzleNumber: number | null;
  rawInput: string | null;
}

export interface SubmissionError {
  error: string;
  status: number;
}

type Detector = (text: string) => ParseResult | null;

export function resolveSubmission(
  body: unknown,
  detect: Detector = detectAndParse,
): ResolvedSubmission | SubmissionError {
  const b = (body ?? {}) as Record<string, unknown>;

  // Paste mode
  if (typeof b.rawInput === "string" && b.rawInput.length > 0) {
    const parsed = detect(b.rawInput);
    if (!parsed) return { error: "Could not parse result", status: 422 };
    return { ...parsed, rawInput: b.rawInput };
  }

  // Manual mode
  if (
    typeof b.gameId === "string" && b.gameId.length > 0 &&
    typeof b.value === "number" && Number.isFinite(b.value) &&
    typeof b.solved === "boolean"
  ) {
    return {
      gameId: b.gameId,
      variant: typeof b.variant === "string" && b.variant.length > 0 ? b.variant : null,
      value: b.value,
      solved: b.solved,
      puzzleNumber: null,
      rawInput: null,
    };
  }

  return { error: "Missing or invalid fields", status: 400 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- submission`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/submission.ts src/lib/submission.test.ts
git commit -m "feat: resolveSubmission unifying paste and manual entry"
```

---

### Task 8: Wire entries route to manual+paste; add `GET /api/games`; parse-failure logging

**Files:**
- Modify: `src/app/api/entries/route.ts`
- Create: `src/app/api/games/route.ts`

**Interfaces:**
- Consumes: `resolveSubmission`/`SubmissionError` (Task 7), plus existing `sql`, `verifyGroupToken`, `hashSecret`/`verifySecret`, `newId`, `localDateInTz`.
- Produces:
  - `POST /api/entries` now accepts either `{ displayName, pin, rawInput }` OR `{ displayName, pin, gameId, variant?, value, solved }`.
  - `GET /api/games` → `{ games: { id, name, type, metricDirection, hasVariants }[] }` for the group (auth required).

No unit tests (DB + Next runtime). Verified by `npm run build` + the smoke test in Task 11.

- [ ] **Step 1: Rewrite the entries route to use `resolveSubmission`**

`src/app/api/entries/route.ts` (replace entire file):
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { hashSecret, verifySecret } from "@/auth/hash";
import { newId } from "@/lib/ids";
import { localDateInTz } from "@/lib/day";
import { resolveSubmission } from "@/lib/submission";

export const runtime = "nodejs";

async function requireGroup(): Promise<string | null> {
  const token = cookies().get("group_token")?.value;
  if (!token) return null;
  const payload = await verifyGroupToken(token);
  return payload?.groupId ?? null;
}

export async function POST(req: Request) {
  const groupId = await requireGroup();
  if (!groupId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { displayName, pin } = body as { displayName?: string; pin?: string };
  if (
    typeof displayName !== "string" || displayName.length === 0 ||
    typeof pin !== "string" || pin.length === 0
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const resolved = resolveSubmission(body);
  if ("error" in resolved) {
    if (typeof body.rawInput === "string" && resolved.status === 422) {
      // Surface parser drift: a share text we failed to recognize.
      console.warn("[parse-failure]", body.rawInput.slice(0, 120));
    }
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const timezone = groupRows[0].timezone;

  // Find or create the player, enforcing PIN.
  const existing = (await sql`
    SELECT id, pin_hash FROM players WHERE group_id = ${groupId} AND display_name = ${displayName}
  `) as { id: string; pin_hash: string }[];

  let playerId: string;
  if (existing[0]) {
    if (!(await verifySecret(pin, existing[0].pin_hash))) {
      return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });
    }
    playerId = existing[0].id;
  } else {
    playerId = newId("p");
    await sql`
      INSERT INTO players (id, group_id, display_name, pin_hash)
      VALUES (${playerId}, ${groupId}, ${displayName}, ${await hashSecret(pin)})
    `;
  }

  // Verify the game exists in this group.
  const game = (await sql`
    SELECT id FROM games WHERE id = ${resolved.gameId} AND group_id = ${groupId}
  `) as { id: string }[];
  if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

  // Append-only: supersede any prior active entry for this player/game/variant/day.
  const puzzleDate = localDateInTz(timezone);
  const priorRows = (await sql`
    SELECT id, version FROM entries
    WHERE group_id = ${groupId} AND player_id = ${playerId} AND game_id = ${resolved.gameId}
      AND puzzle_date = ${puzzleDate} AND (variant IS NOT DISTINCT FROM ${resolved.variant})
      AND superseded_by IS NULL
  `) as { id: string; version: number }[];

  const entryId = newId("e");
  const version = (priorRows[0]?.version ?? 0) + 1;
  await sql`
    INSERT INTO entries (id, group_id, player_id, game_id, variant, puzzle_date,
      puzzle_number, raw_input, parsed_value, solved, is_late, version)
    VALUES (${entryId}, ${groupId}, ${playerId}, ${resolved.gameId}, ${resolved.variant},
      ${puzzleDate}, ${resolved.puzzleNumber}, ${resolved.rawInput}, ${resolved.value},
      ${resolved.solved}, false, ${version})
  `;
  if (priorRows[0]) {
    await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${priorRows[0].id}`;
  }

  return NextResponse.json({ ok: true, parsed: resolved });
}
```

- [ ] **Step 2: Create the games endpoint**

`src/app/api/games/route.ts`:
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = (await sql`
    SELECT id, name, type, metric_direction, has_variants
    FROM games WHERE group_id = ${payload.groupId} AND active = true
    ORDER BY name
  `) as {
    id: string;
    name: string;
    type: string;
    metric_direction: string;
    has_variants: boolean;
  }[];

  const games = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    metricDirection: r.metric_direction,
    hasVariants: r.has_variants,
  }));
  return NextResponse.json({ games });
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `DATABASE_URL='postgres://u:p@localhost/db' AUTH_SECRET='x-at-least-32-bytes-xxxxxxxxxxxxxx' npm run build`
Expected: compiles with no type errors; `/api/games` and `/api/entries` listed as dynamic routes.

- [ ] **Step 4: Run the full unit suite (no regressions)**

Run: `npm test`
Expected: PASS (all Plan 1 + Plan 2 unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/entries/route.ts src/app/api/games/route.ts
git commit -m "feat: manual+paste entries, games endpoint, parse-failure logging"
```

---

### Task 9: Seed the full game catalog

**Files:**
- Modify: `scripts/seed.mjs`

**Interfaces:**
- Consumes: nothing (ops script).
- Produces: idempotent seed of all built-in games. Games with a parser get `parser_id`; manual-only games get `parser_id = NULL` so they still appear for manual entry.

- [ ] **Step 1: Rewrite the seed script**

`scripts/seed.mjs` (replace entire file):
```js
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

await sql`INSERT INTO groups (id, name, passphrase_hash)
  VALUES ('g1', 'Friends', 'REPLACE_ME')
  ON CONFLICT (id) DO NOTHING`;

// [id, name, type, metric_direction, parser_id|null, has_variants]
const games = [
  ["wordle", "Wordle", "outcome", "lower_better", "wordle", false],
  ["pips", "Pips", "timed", "lower_better", "pips", true],
  ["connections", "Connections", "outcome", "lower_better", "connections", false],
  ["minute-cryptic", "Minute Cryptic", "outcome", "lower_better", "minute-cryptic", false],
  ["queens", "Queens", "timed", "lower_better", "queens", false],
  ["tango", "Tango", "timed", "lower_better", "tango", false],
  ["mini-sudoku", "Mini Sudoku", "timed", "lower_better", "mini-sudoku", false],
  // Manual-only for now (no parser yet) — still fully loggable via manual entry.
  ["strands", "Strands", "outcome", "lower_better", null, false],
  ["nyt-mini", "NYT Mini", "timed", "lower_better", null, false],
  ["zip", "Zip", "timed", "lower_better", null, false],
  ["crossclimb", "Crossclimb", "timed", "lower_better", null, false],
  ["pinpoint", "Pinpoint", "outcome", "lower_better", null, false],
  ["patches", "Patches", "timed", "lower_better", null, false],
];

for (const [id, name, type, dir, parserId, hasVariants] of games) {
  await sql`INSERT INTO games (id, group_id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${id}, 'g1', ${name}, ${type}, ${dir}, ${parserId}, ${hasVariants})
    ON CONFLICT (id) DO NOTHING`;
}

console.log(`Seed complete (${games.length} games).`);
```

- [ ] **Step 2: Run the seed against the live DB**

Run: `set -a && . ./.env.local && set +a && node scripts/seed.mjs`
Expected: `Seed complete (13 games).` (existing rows are left untouched by `ON CONFLICT DO NOTHING`).

- [ ] **Step 3: Verify the catalog**

Run:
```bash
set -a && . ./.env.local && set +a && node --input-type=module -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const g = await sql('SELECT id, type, metric_direction, parser_id, has_variants FROM games ORDER BY name');
for (const r of g) console.log(r.id, r.type, r.metric_direction, 'parser=' + (r.parser_id ?? 'none'), 'variants=' + r.has_variants);
"
```
Expected: 13 games listed; `pips` shows `variants=true`; manual-only games show `parser=none`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.mjs
git commit -m "feat: seed full game catalog (parsers + manual-only games)"
```

---

### Task 10: Manual-entry UI

**Files:**
- Modify: `src/app/tracker.tsx`

**Interfaces:**
- Consumes: `GET /api/games`, `POST /api/entries` (manual body), `parseClock` (Task 1).
- Produces: user-facing manual entry. No exports.

Behavior: after auth, fetch the game list. Keep the paste box (primary). Add a "Enter manually" section: a game `<select>`; if the selected game `hasVariants`, show a difficulty `<select>` (Easy/Medium/Hard); a value input that is an `m:ss` text box when the game `type === "timed"` else a number box for guesses/mistakes; a "Solved" checkbox (default checked); submit. Convert `m:ss` → seconds via `parseClock` before sending.

- [ ] **Step 1: Replace the tracker component**

`src/app/tracker.tsx` (replace entire file):
```tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { parseClock } from "@/lib/time";

type Row = { displayName: string; wins: number };
type Game = { id: string; name: string; type: string; metricDirection: string; hasVariants: boolean };

export function Tracker() {
  const [authed, setAuthed] = useState(false);
  const authedRef = useRef(false);
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState<Row[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState("");
  const [variant, setVariant] = useState("easy");
  const [manualValue, setManualValue] = useState("");
  const [solved, setSolved] = useState(true);

  const markAuthed = () => { setAuthed(true); authedRef.current = true; };

  const loadGames = useCallback(async () => {
    const res = await fetch("/api/games");
    if (res.ok) {
      const data = await res.json();
      setGames(data.games);
      if (data.games[0] && !gameId) setGameId(data.games[0].id);
    }
  }, [gameId]);

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setBoard(data.players);
        markAuthed();
        return;
      }
      if (res.status === 401) return; // not authenticated yet — show gate
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    } catch {
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (authed) loadGames();
  }, [authed, loadGames]);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) { markAuthed(); loadBoard(); loadGames(); }
    else { const data = await res.json().catch(() => ({})); setMessage(data.error ?? "Wrong passphrase"); }
  }

  async function submitEntry(payload: object) {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, pin, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Saved: ${data.parsed?.gameId ?? "entry"} (${data.parsed?.value ?? ""})`);
      loadBoard();
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
    let value: number | null;
    if (game.type === "timed") value = parseClock(manualValue);
    else value = /^\d+$/.test(manualValue.trim()) ? Number(manualValue.trim()) : null;
    if (value === null) { setMessage("Enter a valid value (time as m:ss, or a number)"); return; }
    await submitEntry({ gameId, variant: game.hasVariants ? variant : null, value, solved });
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
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {selectedGame?.hasVariants && (
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          )}
          <input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder={selectedGame?.type === "timed" ? "time m:ss" : "guesses / mistakes"}
          />
          <label><input type="checkbox" checked={solved} onChange={(e) => setSolved(e.target.checked)} /> Solved</label>
          <button type="submit">Submit manually</button>
        </form>
      </section>

      <p>{message}</p>

      <h2>Today — Wins</h2>
      <table>
        <thead><tr><th>Player</th><th>Wins</th></tr></thead>
        <tbody>
          {board.map((r) => <tr key={r.displayName}><td>{r.displayName}</td><td>{r.wins}</td></tr>)}
        </tbody>
      </table>
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
git commit -m "feat: manual-entry UI (game picker, difficulty, timed/outcome input)"
```

---

### Task 11: Live smoke test (documented; requires Neon)

**Files:** none (verification only).

- [ ] **Step 1: Migrate + seed + set passphrase (idempotent)**

```bash
cd "<project root>"
set -a && . ./.env.local && set +a
node scripts/migrate.mjs
node scripts/seed.mjs
node scripts/set-passphrase.mjs friends123
```

- [ ] **Step 2: Start the dev server and exercise the new paths**

Start `npm run dev`, then (auth to get the cookie token, as in Plan 1's smoke test) verify:
- Paste `Pips #317 Hard 🔴\n9:53` → saved, `parsed.gameId = "pips"`, `variant = "hard"`, `value = 593`.
- Paste `Connections\nPuzzle #1116\n…grid…` → `parsed.value = 2`, `solved = true`.
- Paste `Queens #792\n0:31 👑` → `value = 31`.
- `GET /api/games` → returns 13 games incl. `pips` with `hasVariants: true`.
- Manual submit `{ gameId: "nyt-mini", value: 42, solved: true }` → saved (manual path, a game with no parser).
- `GET /api/leaderboard` → reflects the new entries; Pips Easy vs Hard are ranked separately (submit both difficulties for two players to confirm variant grouping).

Expected: all succeed; the leaderboard shows per-(game,variant,day) winners.

- [ ] **Step 3: (optional) clear test data**

If desired, delete the Plan 1 smoke-test rows so only real data remains:
```bash
set -a && . ./.env.local && set +a && node --input-type=module -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
await sql('DELETE FROM entries'); await sql('DELETE FROM players');
console.log('cleared entries + players');
"
```

---

## Self-Review

**Spec coverage (Plan 2 slice of the design spec §2–§9):**
- Paste-first auto-detect for more games → Tasks 2–6. ✅
- Manual-entry fallback covering every configured game → Tasks 7, 8, 10. ✅
- Configurable games (add via config row; parser optional) → Task 9 seed + `parser_id` nullable; documented extension points (LinkedIn factory Task 5, registry Task 6). ✅
- Difficulty variants compared like-for-like (Pips) → Task 2 (variant) + existing `wins.ts` grouping; smoke-tested Task 11. ✅
- Minute Cryptic ranks by hints, dated (no puzzle number) → Task 4. ✅
- Parse-failure logging → Task 8. ✅
- Deferred (not gaps): sortable multi-metric board, streaks, daily-lock/late-entry, per-game boards, admin UI → Plans 3–4. Auto-parsers for Strands/NYT-Mini/Zip/Crossclimb/Pinpoint/Patches await real samples; they work via manual entry now (Task 9) and each is a small future parser module.

**Placeholder scan:** No TBD/TODO. Every code step has complete code. `seed.mjs` `REPLACE_ME` passphrase hash is intentional (overwritten by `set-passphrase.mjs`, per Plan 1). ✅

**Type consistency:** `Parser`/`ParseResult` reused from `src/parsers/types.ts` unchanged. `parseClock` signature identical across Tasks 1/2/5/10. `ResolvedSubmission`/`resolveSubmission` defined in Task 7 and consumed with matching shape in Task 8. Game ids match between parsers (`gameId`), the registry (Task 6), and the seed (Task 9): `wordle`, `pips`, `connections`, `minute-cryptic`, `queens`, `tango`, `mini-sudoku`. The entries route reads `resolved.{gameId,variant,value,solved,puzzleNumber,rawInput}` — all present on `ResolvedSubmission`. The games endpoint returns `metricDirection`/`hasVariants` (camelCase) and the UI `Game` type matches. ✅
