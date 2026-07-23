# Today Card Tweaks (Pips per-difficulty rows + chevron placement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In the expandable Today card, split variant games (Pips) into one row per difficulty *played that day* (matching the Standings board), and move the expand chevron to the bottom-right of the card.

**Architecture:** Generalize the pure `computeTodayDetail` to emit one row per (game, variant-present-today) instead of one per game, reusing the board's `compareVariant` ordering; the UI renders the variant in the row label and the chevron moves via CSS. No schema/API-shape change beyond adding a `variant` field to the row.

**Tech Stack:** TypeScript, React 18, Vitest (+ jsdom), CSS Modules.

## Global Constraints

- **A, not B:** show a Pips row only for each difficulty that has ≥1 entry today (data-driven; matches the Standings daily board). Do NOT hardcode/always-show all three.
- **Variant ordering matches the board** — reuse `compareVariant` from `medals.ts` (null first, then easy/medium/hard, then alphabetical).
- **Non-variant games unchanged** — exactly one row (variant null), same as today. A variant game with **no** entries today → one row (variant null, not played).
- **No schema migration.** `/api/me` route logic is unchanged (it already returns all entries incl. `variant`); only `computeTodayDetail`'s output gains a `variant` field + more rows, and the type flows through `MeResponse` (already imported).
- Rank/score still today-only, display-only; collapsed card otherwise unchanged.

---

## Task 1: `computeTodayDetail` emits per-variant rows

**Files:** Modify `src/scoring/medals.ts` (export `compareVariant`), `src/scoring/todayDetail.ts`, `src/scoring/todayDetail.test.ts`.

**Interfaces:**
- `TodayGameDetail` gains `variant: string | null` (after `name`).
- `compareVariant(a: string | null, b: string | null): number` becomes exported from `medals.ts`.

- [ ] **Step 1: Export `compareVariant`** — in `src/scoring/medals.ts`, change `function compareVariant(` to `export function compareVariant(` (no other change; `PIPS_ORDER` stays private). Run `npx tsc --noEmit` (0) + `npx vitest run src/scoring/medals.test.ts` (still green).

- [ ] **Step 2: Update the failing tests** in `src/scoring/todayDetail.test.ts` — add `variant: <expected>` to every existing expected row (non-variant games → `variant: null`), and add the new variant cases:
```ts
it("splits a variant game (Pips) into one row per difficulty played today, board order", () => {
  const games = [{ id: "pips", name: "Pips" }];
  const entries: TodayEntry[] = [
    { playerId: "me", gameId: "pips", variant: "medium", value: 60, solved: true, direction: "lower_better" },
    { playerId: "a", gameId: "pips", variant: "medium", value: 90, solved: true, direction: "lower_better" },
    { playerId: "b", gameId: "pips", variant: "easy", value: 20, solved: true, direction: "lower_better" },
    { playerId: "c", gameId: "pips", variant: "hard", value: 200, solved: true, direction: "lower_better" },
  ];
  const rows = computeTodayDetail({ games, entries, viewerId: "me" });
  expect(rows.map((r) => r.variant)).toEqual(["easy", "medium", "hard"]); // compareVariant order
  const easy = rows.find((r) => r.variant === "easy")!;
  expect(easy).toMatchObject({ played: false, rank: null, playerCount: 1 }); // viewer didn't play easy
  const medium = rows.find((r) => r.variant === "medium")!;
  expect(medium).toMatchObject({ played: true, rank: 1, playerCount: 2, solved: true }); // 60 beats 90
});
it("a variant game with a single difficulty today → one row with that variant", () => {
  const rows = computeTodayDetail({ games: [{ id: "pips", name: "Pips" }],
    entries: [{ playerId: "me", gameId: "pips", variant: "hard", value: 100, solved: true, direction: "lower_better" }], viewerId: "me" });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ variant: "hard", played: true, playerCount: 1 });
});
it("a variant game with NO entries today → one row, variant null, not played", () => {
  const rows = computeTodayDetail({ games: [{ id: "pips", name: "Pips" }], entries: [], viewerId: "me" });
  expect(rows).toEqual([{ gameId: "pips", name: "Pips", variant: null, played: false, valueFormatted: null, solved: false, rank: null, playerCount: 0 }]);
});
it("non-variant game stays a single row (variant null)", () => {
  const rows = computeTodayDetail({ games: [{ id: "wordle", name: "Wordle" }],
    entries: [{ playerId: "me", gameId: "wordle", variant: null, value: 3, solved: true, direction: "lower_better" }], viewerId: "me" });
  expect(rows).toHaveLength(1);
  expect(rows[0].variant).toBeNull();
});
```

- [ ] **Step 3: Run → FAIL** (`npx vitest run src/scoring/todayDetail.test.ts`).

- [ ] **Step 4: Reimplement `src/scoring/todayDetail.ts`** (add `variant` to the interface + split by variant):
```ts
import { formatResult } from "@/lib/formatResult";
import { isBetter } from "@/scoring/wins";
import { compareVariant } from "@/scoring/medals";
import type { ResultDetail } from "@/parsers/types";

export interface TodayEntry {
  playerId: string; gameId: string; variant: string | null;
  value: number; solved: boolean; direction: "lower_better" | "higher_better"; detail?: ResultDetail | null;
}
export interface TodayGameDetail {
  gameId: string; name: string; variant: string | null;
  played: boolean; valueFormatted: string | null; solved: boolean; rank: number | null; playerCount: number;
}

function scopeRow(game: { id: string; name: string }, scope: TodayEntry[], variant: string | null, viewerId: string): TodayGameDetail {
  const playerCount = new Set(scope.map((e) => e.playerId)).size;
  const mine = scope.find((e) => e.playerId === viewerId) ?? null;
  if (!mine) return { gameId: game.id, name: game.name, variant, played: false, valueFormatted: null, solved: false, rank: null, playerCount };
  let rank: number | null = null;
  if (mine.solved) {
    const better = new Set(scope.filter((e) => e.solved && isBetter(e.value, mine.value, mine.direction)).map((e) => e.value));
    rank = better.size + 1;
  }
  return {
    gameId: game.id, name: game.name, variant, played: true,
    valueFormatted: formatResult(game.id, mine.value, mine.solved, mine.detail ?? null),
    solved: mine.solved, rank, playerCount,
  };
}

export function computeTodayDetail(input: {
  games: { id: string; name: string }[]; entries: TodayEntry[]; viewerId: string;
}): TodayGameDetail[] {
  const byGame = new Map<string, TodayEntry[]>();
  for (const e of input.entries) {
    const g = byGame.get(e.gameId) ?? [];
    g.push(e);
    byGame.set(e.gameId, g);
  }
  return input.games.flatMap((game) => {
    const all = byGame.get(game.id) ?? [];
    const variants = [...new Set(all.map((e) => e.variant ?? null))];
    if (variants.length <= 1) {
      const v = variants.length === 1 ? variants[0] : null;
      return [scopeRow(game, all, v, input.viewerId)];
    }
    return variants
      .sort(compareVariant)
      .map((v) => scopeRow(game, all.filter((e) => (e.variant ?? null) === v), v, input.viewerId));
  });
}
```

- [ ] **Step 5: Run → PASS** (`npx vitest run src/scoring/todayDetail.test.ts`), `npx tsc --noEmit` (0), full `npx vitest run` (the me route test builds `todayDetail` — confirm it still passes; if it asserted exact row objects, add `variant: null` there).

- [ ] **Step 6: Commit**
```bash
git add src/scoring/medals.ts src/scoring/todayDetail.ts src/scoring/todayDetail.test.ts
git commit -m "feat(home): per-difficulty Today rows for variant games (Pips)"
```

---

## Task 2: UI — variant label + chevron to bottom-right

**Files:** Modify `src/app/(app)/TodayCard.tsx`, `src/app/(app)/page.module.css`, `src/app/(app)/todayCard.test.tsx`.

**Interfaces:**
- Consumes: `TodayGameDetail.variant` (Task 1).

- [ ] **Step 1: Update the component test** `src/app/(app)/todayCard.test.tsx` — extend the `todayDetail` fixture with a Pips variant row and assert the label + that the chevron/expand still works:
```tsx
// add to the fixture:
// { gameId: "pips", name: "Pips", variant: "easy", played: true, valueFormatted: "1:12", solved: true, rank: 1, playerCount: 3 }
it("labels a variant row with its difficulty", () => {
  render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={[
    { gameId: "pips", name: "Pips", variant: "easy", played: true, valueFormatted: "1:12", solved: true, rank: 1, playerCount: 3 },
  ]} />);
  fireEvent.click(screen.getByRole("button", { name: /today/i }));
  expect(screen.getByText(/Pips.*Easy/i)).toBeTruthy();
});
```
(Keep the existing tests; add `variant: null` to their existing non-Pips fixture rows so they still type-check.)

- [ ] **Step 2: Run → FAIL** (label not rendered yet / type error on the fixture).

- [ ] **Step 3: Implement in `TodayCard.tsx`:**
  - Add a small `capitalize(s: string): string` helper (`s.charAt(0).toUpperCase() + s.slice(1)`).
  - Row label = `variant ? `${name} — ${capitalize(variant)}` : name`. Use it wherever the row currently renders `name`. Keep the play link keyed on `gameUrl(gameId)` (same URL for every variant of a game) and the `aria-label` as `Open ${name}` (base name is fine).
  - Give each row a stable React `key` of `` `${gameId}|${variant ?? ""}` `` (a game now yields multiple rows).

- [ ] **Step 4: Move the chevron to bottom-right** in `src/app/(app)/page.module.css` — the `.chev` rule currently pins it top-right of the card head. Reposition it to the **bottom-right of the collapsed card**: place it in/aligned with the streak row (right-aligned, e.g. `margin-left: auto` on the chevron within the `.streakRow`), OR if it stays absolutely positioned, change `top` to `bottom` (keep `right`). Read `TodayCard.tsx`/`page.module.css` first to see the actual current placement and choose the cleaner of the two; the rotate-on-open + `prefers-reduced-motion` gating stay. Do not disturb the collapsed count/tiles/streak content.

- [ ] **Step 5: Run → PASS** (`npx vitest run src/app/(app)/todayCard.test.tsx`), `npx tsc --noEmit` (0), full `npx vitest run`, `npm run build`.

- [ ] **Step 6: Commit**
```bash
git add "src/app/(app)/TodayCard.tsx" "src/app/(app)/page.module.css" "src/app/(app)/todayCard.test.tsx"
git commit -m "feat(home): Today rows show Pips difficulty; chevron moved to bottom-right"
```

---

## Deploy (gated — owner go-ahead)

Code-only, no migration. Standard: backup tag → PR → CI → owner approves → squash-merge → prod health. Owner verifies on the live Today card (Pips split into difficulty rows; chevron bottom-right).

## Self-Review

- **Spec coverage:** Pips → per-difficulty rows played-that-day (Task 1, option A, board order via `compareVariant`); non-variant + no-entry cases preserved (Task 1 tests); variant label in UI (Task 2); chevron bottom-right (Task 2 Step 4). ✓
- **Placeholder scan:** none — code/tests concrete; Task 2 Step 4 says "read the file then pick the cleaner of two named approaches," both fully specified.
- **Type consistency:** `TodayGameDetail.variant: string|null` added in Task 1 flows to `MeResponse` (imported) + `TodayCard` props (Task 2); `compareVariant` signature matches medals.ts; `scopeRow` reuses the prior rank/format logic unchanged.
