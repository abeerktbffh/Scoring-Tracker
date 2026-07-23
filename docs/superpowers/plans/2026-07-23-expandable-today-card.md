# Expandable Today Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home's Today card tap-to-expand; expanded, each game shows today's score, the viewer's rank today, and a small icon-only play link (delivers feature F002).

**Architecture:** A pure `gameLinks` URL map (F002) + a pure `computeTodayDetail` that ranks the viewer per game in today's contest (reusing the existing daily-contest ranking) + a `/api/me` extension returning that detail + the Home Today card becoming an expandable disclosure. No schema change; rank is computed from existing entries; play URLs live in code.

**Tech Stack:** Next.js 14.2 App Router, TypeScript, React 18, Vitest (jsdom for component tests), Neon stateless `sql`.

## Global Constraints

- **No schema migration.** Play URLs live in code; rank is derived from existing `entries`.
- **Ranking scalar untouched** — reuse the existing daily-contest ranking; display-only.
- **Rank window = TODAY** (the daily contest) only.
- **Collapsed Today card is visually unchanged** — only a chevron + tap/keyboard affordance is added.
- **Play link = icon only** (no "Play" text), shown ONLY for games with a URL in the map.
- **Accessibility:** the card is `role="button"` with `aria-expanded`, keyboard-activatable (Enter/Space); reveal respects `prefers-reduced-motion`; the play icon has `aria-label="Open <game name>"`.
- **Reads are session-scoped** (viewer from session; optional `?group=` handled exactly as the existing `/api/me` does).
- **YAGNI:** Home Today card only.
- Component tests follow repo convention: first line `// @vitest-environment jsdom`, `import React`, `afterEach(cleanup)` (no globals/auto-cleanup).

---

## File Structure

- **Create** `src/lib/gameLinks.ts` + test — F002 URL map (Task 1).
- **Create** `src/scoring/todayDetail.ts` + test — per-game today score/rank assembly (Task 2).
- **Modify** `src/app/(app)/api/me/route.ts`, `src/lib/api.ts` (+ me route test) — return `todayDetail` (Task 3).
- **Modify** `src/app/(app)/page.tsx`, `src/app/(app)/page.module.css` (+ a component test) — expandable card (Task 4).

---

## Task 1: `gameLinks.ts` — F002 URL map (pure)

**Files:** Create `src/lib/gameLinks.ts`, `src/lib/gameLinks.test.ts`

**Interfaces:**
- Produces: `GAME_URLS: Record<string, string>` and `gameUrl(gameId: string): string | null`.

- [ ] **Step 1: Write the failing test** `src/lib/gameLinks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gameUrl, GAME_URLS } from "./gameLinks";

describe("gameUrl", () => {
  it("returns the mapped URL for a known game", () => {
    expect(gameUrl("wordle")).toBe("https://www.nytimes.com/games/wordle/index.html");
    expect(gameUrl("hindu-mini")).toBe("https://www.thehindu.com/crosswords/thehindu-mini-crossword/");
  });
  it("returns null for an unmapped game", () => {
    expect(gameUrl("nyt-mini")).toBeNull();
    expect(gameUrl("totally-unknown")).toBeNull();
  });
  it("every mapped URL is https", () => {
    for (const u of Object.values(GAME_URLS)) expect(u.startsWith("https://")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/gameLinks.test.ts`).

- [ ] **Step 3: Implement `src/lib/gameLinks.ts`:**
```ts
/**
 * Per-game "go play it" URLs (feature F002). Code map — no DB column.
 * A game with no entry here shows no play icon.
 */
export const GAME_URLS: Record<string, string> = {
  wordle: "https://www.nytimes.com/games/wordle/index.html",
  connections: "https://www.nytimes.com/games/connections",
  strands: "https://www.nytimes.com/games/strands",
  pips: "https://www.nytimes.com/games/pips",
  queens: "https://www.linkedin.com/games/queens/",
  tango: "https://www.linkedin.com/games/tango/",
  pinpoint: "https://www.linkedin.com/games/pinpoint/",
  crossclimb: "https://www.linkedin.com/games/crossclimb/",
  zip: "https://www.linkedin.com/games/zip/",
  "minute-cryptic": "https://minutecryptic.com/",
  "india-mini": "https://indiamini.in/play/",
  "hindu-mini": "https://www.thehindu.com/crosswords/thehindu-mini-crossword/",
  "easy-down": "https://www.thehindu.com/crosswords/hindu-one-down/",
  // Best-guess LinkedIn slugs — OWNER TO VERIFY (tap to check); drop if wrong.
  "mini-sudoku": "https://www.linkedin.com/games/mini-sudoku/",
  patches: "https://www.linkedin.com/games/patches/",
  wend: "https://www.linkedin.com/games/wend/",
};

export function gameUrl(gameId: string): string | null {
  return GAME_URLS[gameId] ?? null;
}
```

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit` (0).

- [ ] **Step 5: Commit** `git add src/lib/gameLinks.ts src/lib/gameLinks.test.ts && git commit -m "feat(f002): per-game play-URL map"`

---

## Task 2: `computeTodayDetail` — per-game today score + viewer rank (pure)

**Files:** Create `src/scoring/todayDetail.ts`, `src/scoring/todayDetail.test.ts`

**Interfaces:**
- Consumes: `formatResult` (`@/lib/formatResult`), `isBetter` (from `@/scoring/wins` — **confirm the export path before importing**; it is the same helper `medals.ts` uses for direction comparison), `ResultDetail` (`@/parsers/types`).
- Produces:
  - `interface TodayEntry { playerId: string; gameId: string; variant: string | null; value: number; solved: boolean; direction: "lower_better" | "higher_better"; detail?: ResultDetail | null }`
  - `interface TodayGameDetail { gameId: string; name: string; played: boolean; valueFormatted: string | null; solved: boolean; rank: number | null; playerCount: number }`
  - `computeTodayDetail(input: { games: { id: string; name: string }[]; entries: TodayEntry[]; viewerId: string }): TodayGameDetail[]`

Behaviour: for each game in `games` (order preserved), among the entries **for that game and the viewer's variant** (if the viewer played) — or all that game's entries if the viewer didn't play — compute:
- `played` = the viewer has an entry for that game.
- `valueFormatted` = `formatResult(gameId, viewerEntry.value, viewerEntry.solved, viewerEntry.detail)`; `null` when not played.
- `solved` = viewer's solved (false when not played).
- `rank` = the viewer's **dense competition rank among *solved* entries in their variant**: `1 + (number of distinct solved values strictly better than the viewer's, per `isBetter`+direction)`. `null` when the viewer didn't play OR didn't solve.
- `playerCount` = number of distinct players with an entry for that game **in the viewer's variant** (when played); when not played, distinct players across all that game's entries.

- [ ] **Step 1: Write the failing test** `src/scoring/todayDetail.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeTodayDetail, type TodayEntry } from "./todayDetail";

const games = [{ id: "wordle", name: "Wordle" }, { id: "pips", name: "Pips" }, { id: "zip", name: "Zip" }];
const e = (o: Partial<TodayEntry>): TodayEntry => ({
  playerId: "p", gameId: "wordle", variant: null, value: 3, solved: true, direction: "lower_better", ...o,
});

describe("computeTodayDetail", () => {
  it("ranks the viewer among solved entries (lower_better) and counts players", () => {
    const entries = [
      e({ playerId: "me", gameId: "wordle", value: 3 }),
      e({ playerId: "a", gameId: "wordle", value: 2 }),
      e({ playerId: "b", gameId: "wordle", value: 5 }),
    ];
    const wordle = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!;
    expect(wordle).toMatchObject({ played: true, solved: true, rank: 2, playerCount: 3 });
    expect(wordle.valueFormatted).toBe("3/6 ✓");
  });
  it("ties share a rank (dense): two players on the best value → viewer is 1st", () => {
    const entries = [
      e({ playerId: "me", gameId: "wordle", value: 2 }),
      e({ playerId: "a", gameId: "wordle", value: 2 }),
      e({ playerId: "b", gameId: "wordle", value: 4 }),
    ];
    expect(computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!.rank).toBe(1);
  });
  it("not played → played:false, null score/rank, playerCount from others", () => {
    const entries = [e({ playerId: "a", gameId: "wordle", value: 2 })];
    const w = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!;
    expect(w).toEqual({ gameId: "wordle", name: "Wordle", played: false, valueFormatted: null, solved: false, rank: null, playerCount: 1 });
  });
  it("viewer unsolved → rank null but played true", () => {
    const entries = [e({ playerId: "me", gameId: "wordle", value: 7, solved: false }), e({ playerId: "a", value: 3 })];
    const w = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "wordle")!;
    expect(w.played).toBe(true); expect(w.rank).toBeNull();
  });
  it("game with no entries at all → played:false, playerCount 0", () => {
    const z = computeTodayDetail({ games, entries: [], viewerId: "me" }).find((d) => d.gameId === "zip")!;
    expect(z).toMatchObject({ played: false, rank: null, playerCount: 0 });
  });
  it("respects the viewer's variant (Pips): rank only vs same-variant players", () => {
    const entries = [
      e({ playerId: "me", gameId: "pips", variant: "hard", value: 60 }),
      e({ playerId: "a", gameId: "pips", variant: "hard", value: 90 }),
      e({ playerId: "b", gameId: "pips", variant: "easy", value: 10 }),
    ];
    const p = computeTodayDetail({ games, entries, viewerId: "me" }).find((d) => d.gameId === "pips")!;
    expect(p).toMatchObject({ rank: 1, playerCount: 2 }); // easy player excluded
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/scoring/todayDetail.ts`:**
```ts
import { formatResult } from "@/lib/formatResult";
import { isBetter } from "@/scoring/wins"; // confirm path: the direction comparator used by medals.ts
import type { ResultDetail } from "@/parsers/types";

export interface TodayEntry {
  playerId: string;
  gameId: string;
  variant: string | null;
  value: number;
  solved: boolean;
  direction: "lower_better" | "higher_better";
  detail?: ResultDetail | null;
}

export interface TodayGameDetail {
  gameId: string;
  name: string;
  played: boolean;
  valueFormatted: string | null;
  solved: boolean;
  rank: number | null;
  playerCount: number;
}

export function computeTodayDetail(input: {
  games: { id: string; name: string }[];
  entries: TodayEntry[];
  viewerId: string;
}): TodayGameDetail[] {
  const byGame = new Map<string, TodayEntry[]>();
  for (const e of input.entries) {
    const g = byGame.get(e.gameId) ?? [];
    g.push(e);
    byGame.set(e.gameId, g);
  }

  return input.games.map((game) => {
    const all = byGame.get(game.id) ?? [];
    const mine = all.find((e) => e.playerId === input.viewerId) ?? null;
    // Rank/count are scoped to the viewer's variant when they played; else all.
    const scope = mine ? all.filter((e) => (e.variant ?? null) === (mine.variant ?? null)) : all;
    const playerCount = new Set(scope.map((e) => e.playerId)).size;

    if (!mine) {
      return { gameId: game.id, name: game.name, played: false, valueFormatted: null, solved: false, rank: null, playerCount };
    }

    let rank: number | null = null;
    if (mine.solved) {
      const dir = mine.direction;
      const betterDistinct = new Set(
        scope.filter((e) => e.solved && isBetter(e.value, mine.value, dir)).map((e) => e.value),
      );
      rank = betterDistinct.size + 1;
    }
    return {
      gameId: game.id,
      name: game.name,
      played: true,
      valueFormatted: formatResult(game.id, mine.value, mine.solved, mine.detail ?? null),
      solved: mine.solved,
      rank,
      playerCount,
    };
  });
}
```
> Before running: open `src/scoring/wins.ts` (or wherever `isBetter` is defined — grep `export function isBetter`) and fix the import to the real path. `isBetter(a, b, dir)` returns true when `a` is strictly better than `b` for the direction.

- [ ] **Step 4: Run → PASS.** `npx tsc --noEmit` (0).

- [ ] **Step 5: Commit** `git add src/scoring/todayDetail.ts src/scoring/todayDetail.test.ts && git commit -m "feat(home): computeTodayDetail (per-game today score + viewer rank)"`

---

## Task 3: `/api/me` returns `todayDetail`

**Files:** Modify `src/app/(app)/api/me/route.ts`, `src/lib/api.ts`; update the me route test.

**Interfaces:**
- Consumes: `computeTodayDetail` + `TodayGameDetail` (Task 2).
- Produces: `MeResponse.todayDetail: TodayGameDetail[]` in `src/lib/api.ts`; `GET /api/me` includes it.

- [ ] **Step 1: Add the type** to `src/lib/api.ts` `MeResponse` (after `today`): `todayDetail: { gameId: string; name: string; played: boolean; valueFormatted: string | null; solved: boolean; rank: number | null; playerCount: number }[];`

- [ ] **Step 2: Extend the route.** In `src/app/(app)/api/me/route.ts`, after computing `today` for the viewer, add a query for **today's entries across all players per tracked game** — model it on the existing per-game standings query in `src/app/api/games/[gameId]/board/route.ts` (join `games`, `superseded_by IS NULL AND is_late = false`, `puzzle_date = ${today}`, the same `active=true` / `?group=` membership+group_games filters this route already applies to `gameRows`/`entryRows`, but WITHOUT the `e.user_id = viewerUserId` restriction so all players are included). Select `user_id, game_id, variant, parsed_value, solved, metric_direction, detail`. Map rows to `TodayEntry` (playerId=user_id, gameId=game_id, value=parsed_value, direction=metric_direction, detail), then:
```ts
const todayDetail = computeTodayDetail({
  games: gameRows.map((g) => ({ id: g.id, name: g.name })),
  entries: todayEntryRows.map((r) => ({
    playerId: r.user_id, gameId: r.game_id, variant: r.variant,
    value: r.parsed_value, solved: r.solved, direction: r.metric_direction, detail: r.detail ?? null,
  })),
  viewerId: viewerUserId,
});
```
Add `todayDetail` to the `NextResponse.json({ ...result, todayDetail, displayName })`.

- [ ] **Step 3: Update the me route test** — extend the existing test's `sql` mock so the new today-entries query returns a small fixture, and assert the response includes `todayDetail` with the viewer's rank for a game (e.g. viewer 2nd of 3). Keep all existing me assertions passing. Run the me test → PASS.

- [ ] **Step 4: Verify** `npx tsc --noEmit` (0), full `npx vitest run`, `npm run build`.

- [ ] **Step 5: Commit** `git add src/app/(app)/api/me/route.ts src/lib/api.ts "src/app/(app)/api/me/route.test.ts" && git commit -m "feat(home): /api/me returns per-game today score + rank"`
> (Adjust the test path to the actual me route test file location if different.)

---

## Task 4: Expandable Today card on Home

**Files:** Modify `src/app/(app)/page.tsx`, `src/app/(app)/page.module.css`; create `src/app/(app)/todayCard.test.tsx` (or co-located component test).

**Interfaces:**
- Consumes: `me.todayDetail` (Task 3), `gameUrl` (Task 1).

- [ ] **Step 1: Write the failing component test** `src/app/(app)/todayCard.test.tsx`:
```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TodayCard } from "./TodayCard";

afterEach(cleanup);

const detail = [
  { gameId: "wordle", name: "Wordle", played: true, valueFormatted: "3/6 ✓", solved: true, rank: 2, playerCount: 6 },
  { gameId: "nyt-mini", name: "NYT Mini", played: false, valueFormatted: null, solved: false, rank: null, playerCount: 0 },
];

describe("TodayCard", () => {
  it("collapsed by default; expands on click to show per-game rows", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    expect(screen.queryByText(/3\/6/)).toBeNull(); // panel hidden until expanded
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(screen.getByText("Wordle")).toBeTruthy();
    expect(screen.getByText(/3\/6/)).toBeTruthy();
    expect(screen.getByText(/2.{0,3} of 6/)).toBeTruthy(); // "2nd of 6"
  });
  it("play icon links to the game URL (new tab) only when a URL exists", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    const play = screen.getByRole("link", { name: /open wordle/i });
    expect(play.getAttribute("href")).toBe("https://www.nytimes.com/games/wordle/index.html");
    expect(play.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("link", { name: /open nyt mini/i })).toBeNull(); // nyt-mini has no URL
  });
  it("not-played row shows the fallback", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(screen.getByText(/not played today/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/app/(app)/todayCard.test.tsx`).

- [ ] **Step 3: Extract + implement `TodayCard`.** Move the existing Today `<Card>` markup out of `HomeReady` into a new `TodayCard` component (same file or a `TodayCard.tsx`), props `{ loggedCount, totalCount, games, streak, todayDetail }`. Keep the collapsed content EXACTLY as it renders today (count, tiles/chips, streak). Add: make the card a `role="button"` `tabIndex={0}` `aria-expanded` element with a chevron, `useState` `open`, toggling on click and Enter/Space (`onKeyDown`); render the expanded panel only when `open`. Each `todayDetail` row: `name`; `valueFormatted ?? "Not played today"`; `rank != null ? `${ordinal(rank)} of ${playerCount}` : "—"` (small `ordinal(n)` helper: 1→"1st", 2→"2nd", 3→"3rd", else `n+"th"` — 11/12/13 edge cases optional); medal tint class for rank 1/2/3; and an icon-only `<a>` when `gameUrl(gameId)` is non-null (`href`, `target="_blank"`, `rel="noopener"`, `aria-label={`Open ${name}`}`, an SVG/existing icon, NO text). `HomeReady` renders `<TodayCard .../>` passing `me.today.*` + `bestCurrentStreak(me)` + `me.todayDetail`.

- [ ] **Step 4: Style** in `page.module.css` — a `.chev` (rotates when open, `transition` gated by `@media (prefers-reduced-motion: reduce)`), the expand panel, per-game rows, rank pill + `.rank1/.rank2/.rank3` medal tints (reuse existing medal/token colors in the file), and the icon link. Do NOT alter the existing collapsed `.today`/tiles/streak styles.

- [ ] **Step 5: Run → PASS** (`npx vitest run src/app/(app)/todayCard.test.tsx`), `npx tsc --noEmit` (0), full `npx vitest run`, `npm run build`.

- [ ] **Step 6: Commit** `git add "src/app/(app)/page.tsx" "src/app/(app)/page.module.css" "src/app/(app)/TodayCard.tsx" "src/app/(app)/todayCard.test.tsx" && git commit -m "feat(home): expandable Today card — per-game score, rank & play link (F002)"`
> (Only include `TodayCard.tsx` in the add if you created it as a separate file.)

---

## Deploy (gated — owner go-ahead)

Code-only, no migration. Standard: backup tag → PR → CI `verify` → owner approves → squash-merge → prod health. Owner-visible acceptance: the expandable card on the real Home (or a draft-PR preview). Verify the 3 "best-guess" play URLs (mini-sudoku/patches/wend) on a real device; drop any that are wrong (one-line map edit).

## Self-Review

- **Spec coverage:** F002 URL map + icon-only link (Task 1 + Task 4); per-game today score via formatResult (Task 2/3/4); viewer rank today via existing daily-contest ranking (Task 2, reusing `isBetter`; Task 3 supplies all-players today entries); expandable card, collapsed unchanged, a11y + reduced-motion (Task 4); no schema change; rank window = today. ✓
- **Placeholder scan:** none — code/tests concrete; two flagged confirmations (isBetter import path; me-route test file path) are "confirm the real location," not missing content.
- **Type consistency:** `TodayGameDetail` identical across Tasks 2→3→4 and `MeResponse`; `TodayEntry` fields match the me-route row mapping; `gameUrl(gameId): string|null` used in Task 4; `computeTodayDetail` input `{games,entries,viewerId}` matches the route call.
