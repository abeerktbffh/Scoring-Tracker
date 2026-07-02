# Front-end / UX Overhaul (Workstream B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Visual components should ALSO apply the frontend-design skill and match the approved mockups (see Global Constraints) — the plan fixes structure, interfaces, tokens, and behavior; the implementer executes the styling to the mockup.

**Goal:** Replace the single-file `tracker.tsx` with a redesigned, installable, mobile-first app — a tokened design system (Editorial Puzzle / Pine & Amber, light+dark), a bottom-tab + drawer shell, four screens (Home/Standings/Log/You), first-class empty/locked/error/loading states, and a PWA offline shell — with no schema change and one additive read-only endpoint.

**Architecture:** A CSS-variable design system drives light/dark themes; presentational components and pure UI-logic functions are built and tested in isolation, then assembled into App Router routes under an authenticated shell (`src/app/(app)/`). Data comes from the existing API plus one new read-only `GET /api/me`. Auth keeps the current passphrase+PIN model, wrapped with client-side "remember me."

**Tech Stack:** Next.js 14.2 (App Router), React 18, TypeScript, `next/font` (Fraunces + Inter), Vitest (+ jsdom + Testing Library for component tests), a minimal service worker for the offline shell.

## Global Constraints

- **Product name: "Bragboard"** (decided 2026-07-02). Use it for the brand wordmark, the browser
  `<title>`, and the PWA manifest `name`/`short_name`. The mockups say "Scoring Tracker" — that was
  the placeholder; render **Bragboard** instead. The deploy URL stays `scoring-tracker.vercel.app`
  for now (cosmetic rename only, out of scope here).
- **No DB schema changes.** Exactly ONE new API route is allowed: `GET /api/me?player=<displayName>` (read-only). All other endpoints under `src/app/api/**` are reused unchanged. Do NOT modify `src/parsers/**`, `src/db/**`, or `src/scoring/**` domain logic (import and reuse them).
- **Secret-free build must stay green** (lazy DB client; Sentry no-ops without DSN). The workstream-A CI `verify` job (typecheck → lint → test → build) must pass.
- **Keep the existing 120 tests green.** New tests are additive.
- **Palette tokens (exact), light:** bg `#fffdf7`, surface `#ffffff`, ink `#1a1710`, muted `#8a7f66`, line `#ece5d5`, accent `#10756a`, accent-2 `#e0952f`, tile-empty `#efe9db`, me-bg `#e2f0ed`.
- **Palette tokens (exact), dark:** bg `#17150e`, surface `#211e15`, ink `#f2ecdd`, muted `#a99a78`, line `#2b271b`, accent `#17a08f`, accent-2 `#e0952f`, tile-empty `#2b271b`, me-bg `#16302b`.
- **Type:** Fraunces (display serif) + Inter (UI/labels/data), self-hosted via `next/font/google`. No OS emoji in app chrome — use the custom icon set. Emoji only inside user-entered text.
- **Themes:** default follows `prefers-color-scheme`; a manual toggle persists to `localStorage["theme"]` and is applied pre-paint via an inline script (no flash).
- **A11y floor:** WCAG AA contrast (both themes), visible keyboard focus, `prefers-reduced-motion` respected, semantic landmarks, labelled controls.
- **Approved visual mockups (visual source of truth):** `.superpowers/brainstorm/95719-1782995429/content/screens.html` (Log/Standings/You), `editorial-themes.html` (light/dark Home), `palette-bc.html` (Pine palette in both themes), `icons-picker.html` (icon set + game picker). Read these before styling.
- **Existing API response shapes (reuse verbatim):**
  - `GET /api/games` → `{ games: [{ id, name, type, metricDirection, hasVariants }] }`
  - `GET /api/leaderboard?window=&player=` → `{ window, locked, players: [{ displayName, wins, gamesPlayed, winRate }] }`
  - `GET /api/games/:id/board?window=&player=` → `{ gameId, window, locked, players: [{ displayName, wins, gamesPlayed, bestValue, currentStreak, longestStreak }] }`
  - `GET /api/players` → `{ players: [{ id, displayName }] }`
  - `POST /api/auth {passphrase}` → `{ ok:true }` + `group_token` cookie, or `{ error }` (401)
  - `POST /api/entries {displayName, pin, rawInput | (gameId,variant,value,solved)}` → `{ ok:true, parsed:{gameId,value,...} }`, or `{ error }` (422 on parse-fail)
  - `POST /api/admin/games`, `POST /api/admin/players/rename` (admin passphrase in body)

---

## File Structure

**Design system**
- `src/design/tokens.css` — CSS custom properties + `[data-theme]` / `prefers-color-scheme`.
- `src/design/theme.ts` — pure `resolveTheme()` + client `useTheme()` hook + pre-paint script string.
- `src/design/icons.tsx` — inline-SVG icon components.

**Pure UI logic (node-tested)**
- `src/lib/leaderboardSort.ts` — `sortPlayers()`.
- `src/lib/gameFilter.ts` — `filterAndOrderGames()` (search + today-first).
- `src/lib/rememberMe.ts` — localStorage helpers for the remembered display name.
- `src/lib/api.ts` — typed client fetch wrappers + `normalizeError()`.
- `src/scoring/me.ts` — pure `computeMe()` aggregation for the `/api/me` route.

**Components** (`src/components/`): `Button.tsx`, `Card.tsx`, `Chip.tsx`, `Segmented.tsx`, `Tile.tsx`, `StatCard.tsx`, `StreakBadge.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `LockedState.tsx`, `ErrorState.tsx`, `LeaderboardTable.tsx`, `GamePicker.tsx`, `TabBar.tsx`, `Drawer.tsx`, `AppShell.tsx`, `SignInGate.tsx`.

**Routing** (`src/app/`): `layout.tsx` (fonts + theme + tokens), `(app)/layout.tsx` (shell), `(app)/page.tsx` (Home), `(app)/standings/page.tsx`, `(app)/log/page.tsx`, `(app)/you/page.tsx`. Delete `src/app/tracker.tsx` and `src/app/page.tsx`'s Tracker use at migration.

**API** (`src/app/api/me/route.ts`) — the one new endpoint.

**PWA** (`public/`): `manifest.webmanifest`, icons, `sw.js`; SW registration in the shell.

---

### Task 1: Design-system foundation — test tooling, tokens, fonts, theme

**Files:**
- Modify: `package.json` (devDeps + nothing else), `vitest.config.ts` (allow per-file jsdom)
- Create: `src/design/tokens.css`, `src/design/theme.ts`, `src/design/theme.test.ts`
- Modify: `src/app/layout.tsx` (fonts + tokens import + pre-paint script), `src/app/globals.css` (reset only)

**Interfaces:**
- Produces: `resolveTheme(stored: "light"|"dark"|null, systemPrefersDark: boolean): "light"|"dark"`; `THEME_PREPAINT: string` (inline script text that sets `document.documentElement.dataset.theme`); a `useTheme()` client hook returning `{ theme, setTheme }`. CSS variables named exactly per Global Constraints (e.g. `--bg`, `--accent`, `--tile-empty`).

- [ ] **Step 1: Add DOM test deps**

Run: `npm install -D jsdom@^24 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14`
Expected: installs; `npm test` still passes (120) — global env stays `node`.

- [ ] **Step 2: Write the failing test for `resolveTheme`**

Create `src/design/theme.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("uses stored preference when set", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("falls back to system when unset", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`resolveTheme` not defined). Run: `npx vitest run src/design/theme.test.ts`

- [ ] **Step 4: Implement `src/design/theme.ts`**

```ts
"use client";
import { useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";

export function resolveTheme(stored: Theme | null, systemPrefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}

// Runs before paint (inlined in <head>) to avoid a flash of the wrong theme.
export const THEME_PREPAINT = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.dataset.theme=(s==='light'||s==='dark')?s:(d?'dark':'light');}catch(e){}})();`;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null);
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(resolveTheme(stored, sys));
  }, []);
  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("theme", t);
    document.documentElement.dataset.theme = t;
    setThemeState(t);
  }, []);
  return { theme, setTheme };
}
```

- [ ] **Step 5: Run it — expect PASS.** Run: `npx vitest run src/design/theme.test.ts`

- [ ] **Step 6: Create `src/design/tokens.css`** — CSS variables for light (`:root`, and `[data-theme="light"]`) and dark (`[data-theme="dark"]`), using the EXACT hex values in Global Constraints, plus spacing scale (`--space-1:4px … --space-6:32px`), radii (`--r-tile:4px; --r-card:16px; --r-pill:99px`), and one shadow token. Map `--font-display`/`--font-ui` to the `next/font` CSS variables set in Step 7.

- [ ] **Step 7: Wire fonts + theme + tokens in `src/app/layout.tsx`**

Replace Bricolage/Space Mono with:
```tsx
import "./globals.css";
import "@/design/tokens.css";
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { THEME_PREPAINT } from "@/design/theme";

const display = Fraunces({ subsets: ["latin"], weight: ["400","600"], variable: "--font-display", display: "swap" });
const ui = Inter({ subsets: ["latin"], weight: ["400","600","700"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = { title: "Bragboard", description: "Your group's daily puzzle standings." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT }} /></head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Reduce `src/app/globals.css` to a reset + base** — box-sizing reset, `body { background: var(--bg); color: var(--ink); font-family: var(--font-ui); }`, `:focus-visible` ring, and a `@media (prefers-reduced-motion: reduce)` block disabling transitions. Remove all old "Arcade Board" styles (they are replaced; components own their styles).

- [ ] **Step 9: Verify** — Run: `npm run typecheck && npm run lint && npm test`. Expected: all pass (120 + 2 new). `npm run build` succeeds.

- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat(ui): design tokens, Fraunces/Inter fonts, theme resolution + DOM test tooling"`

---

### Task 2: Icon set

**Files:** Create `src/design/icons.tsx`, `src/design/icons.test.tsx`

**Interfaces:**
- Produces: named components `Flame, Crown, Check, AlertDot, Trophy, Search, Plus, Chevron, HomeIcon, BoardIcon, YouIcon, MenuIcon`, each `(props: { size?: number; className?: string }) => JSX.Element` rendering an inline `<svg>` with `stroke="currentColor"` (color inherited from CSS). Paths per `icons-picker.html`.

- [ ] **Step 1: Failing test** — `src/design/icons.test.tsx` (add `// @vitest-environment jsdom` at top):
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Flame, Crown } from "./icons";
describe("icons", () => {
  it("render inline svg that inherits color", () => {
    const { container } = render(<Flame />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    render(<Crown size={22} />);
  });
});
```
- [ ] **Step 2: Run — FAIL.** `npx vitest run src/design/icons.test.tsx`
- [ ] **Step 3: Implement `src/design/icons.tsx`** — each icon a small function component; reuse the exact SVG paths from `icons-picker.html` (flame, crown, check, trophy, search, plus, chevron) and simple geometric glyphs for tab icons. `size` defaults to 20; spread `className`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): custom inline-SVG icon set"`

---

### Task 3: Client API layer

**Files:** Create `src/lib/api.ts`, `src/lib/api.test.ts`

**Interfaces:**
- Produces types `Game, OverallRow, GameBoardRow, MeResponse` and async fns:
  `getGames()`, `getLeaderboard(window, player)`, `getBoard(gameId, window, player)`, `getPlayers()`,
  `getMe(player)`, `postAuth(passphrase)`, `postEntry(body)`, `postAdminGame(adminPassphrase, game)`,
  `renamePlayer(adminPassphrase, playerId, newName)`, plus `normalizeError(status, body): string`.
  All return `{ ok: true, data } | { ok: false, error: string, status }`. `MeResponse` matches the spec's `/api/me` shape.

- [ ] **Step 1: Failing test** — `src/lib/api.test.ts` tests `normalizeError` (pure, node env):
```ts
import { describe, it, expect } from "vitest";
import { normalizeError } from "./api";
describe("normalizeError", () => {
  it("maps known statuses to friendly copy", () => {
    expect(normalizeError(401, {})).toMatch(/sign in|passphrase/i);
    expect(normalizeError(422, { error: "Could not parse result" })).toBe("Could not parse result");
    expect(normalizeError(500, {})).toMatch(/something went wrong/i);
  });
});
```
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/lib/api.ts`** — `normalizeError` prefers `body.error`, else maps 401→"Please sign in again.", 403→"Wrong PIN.", 422→"Couldn't read that — check the format.", else "Something went wrong — try again."; fetch wrappers build URLs with `encodeURIComponent(player)`, parse JSON, and return the discriminated union. Types match the API shapes in Global Constraints.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): typed client API layer with friendly error normalization"`

---

### Task 4: `GET /api/me` endpoint + pure aggregation

**Files:** Create `src/scoring/me.ts`, `src/scoring/me.test.ts`, `src/app/api/me/route.ts`

**Interfaces:**
- Produces `computeMe(input): MeResult` — PURE. Input: `{ today: string; games: {id,name}[]; entries: {gameId, variant, puzzleDate, value, solved, direction}[]; }` (entries = this viewer's on-time active entries). Output matches the spec `/api/me` JSON: `{ today: { date, loggedCount, totalCount, games:[{gameId,name,logged}] }, streaks:[{gameId,name,currentStreak,longestStreak}], recent:[{gameId,name,variant,value,solved,puzzleDate}] }`. Streaks reuse `computeGameBoard` from `@/scoring/gameBoard` per game (single-player input); `recent` = entries sorted by `puzzleDate` desc, capped 10.

- [ ] **Step 1: Failing test** — `src/scoring/me.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeMe } from "./me";
describe("computeMe", () => {
  const games = [{ id: "wordle", name: "Wordle" }, { id: "pips", name: "Pips" }];
  it("reports today's logged count and which games", () => {
    const r = computeMe({ today: "2026-07-02", games, entries: [
      { gameId: "wordle", variant: null, puzzleDate: "2026-07-02", value: 3, solved: true, direction: "lower_better" },
    ]});
    expect(r.today).toEqual({ date: "2026-07-02", loggedCount: 1, totalCount: 2,
      games: [{ gameId: "wordle", name: "Wordle", logged: true }, { gameId: "pips", name: "Pips", logged: false }] });
  });
  it("caps recent at 10, newest first", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ gameId: "wordle", variant: null,
      puzzleDate: `2026-06-${String(i + 1).padStart(2, "0")}`, value: 3, solved: true, direction: "lower_better" as const }));
    const r = computeMe({ today: "2026-07-02", games, entries });
    expect(r.recent).toHaveLength(10);
    expect(r.recent[0].puzzleDate).toBe("2026-06-12");
  });
});
```
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/scoring/me.ts`** (pure): build `today.games` from `games` × whether an entry has `puzzleDate === today`; compute per-game streaks by grouping entries and calling `computeGameBoard(entriesForGame, today, null)` and taking the single player's `currentStreak`/`longestStreak` (0 if none); `recent` = `[...entries].sort(desc by puzzleDate).slice(0,10)` mapped with game names.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Implement `src/app/api/me/route.ts`** — mirror `board/route.ts`: `runtime="nodejs"`; group from `group_token` cookie (401 if none); `player` from query; fetch active games and the viewer's on-time active entries (`superseded_by IS NULL AND is_late=false`, `puzzle_date::text`); call `computeMe`; return JSON. No writes.
- [ ] **Step 6: Verify** — `npm run typecheck && npm run lint && npm test && npm run build`. All pass.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(api): add read-only GET /api/me (today status, streaks, recent)"`

---

### Task 5: Presentational primitives

**Files:** Create `src/components/{Button,Card,Chip,Tile,StatCard,StreakBadge,Skeleton}.tsx` and `src/components/primitives.test.tsx`

**Interfaces (Produces):**
- `Button({ variant?: "primary"|"amber"|"ghost", ...buttonProps })`
- `Card({ children, className? })`
- `Chip({ active?, children, onClick? })`
- `Tile({ state: "solved"|"partial"|"empty", children? })` — colored square using `--tile-*`/`--accent*`.
- `StatCard({ value, label })` — Fraunces value, Inter label.
- `StreakBadge({ count })` — `Flame` icon + count, amber pill; renders nothing/`—` when count is 0.
- `Skeleton({ w?, h?, radius? })` — shimmer block honoring reduced-motion.

- [ ] **Step 1: Failing test** — `src/components/primitives.test.tsx` (`// @vitest-environment jsdom`): assert `Tile state="solved"` has the solved class/data-attr; `StreakBadge count={0}` renders no flame; `StreakBadge count={7}` shows "7"; `Button variant="amber"` sets the variant class; `Chip active` sets aria-pressed.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement the components** — each with a co-located CSS module OR classes in `globals.css` scoped by component; use tokens only (no hardcoded hex). Match `screens.html`/`icons-picker.html`. Apply the frontend-design skill for spacing/weight.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): presentational primitives (Button, Card, Chip, Tile, StatCard, StreakBadge, Skeleton)"`

---

### Task 6: State components (empty / locked / error)

**Files:** Create `src/components/{EmptyState,LockedState,ErrorState}.tsx`, `src/components/states.test.tsx`

**Interfaces (Produces):**
- `EmptyState({ title, body, action? })` — action = `{ label, onClick }`.
- `LockedState({ children })` — the redesigned no-peek panel (invitation copy).
- `ErrorState({ message, onRetry })` — shows message + a Retry button that calls `onRetry`.

- [ ] **Step 1: Failing test** (`jsdom`): render `ErrorState` with a spy `onRetry`, click Retry, expect spy called; `EmptyState` renders title/body and optional action; `LockedState` renders its children.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** (tokened, match the calm editorial tone; copy in the app's voice). **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): first-class empty/locked/error state components"`

---

### Task 7: Segmented control + LeaderboardTable + sort logic

**Files:** Create `src/lib/leaderboardSort.ts`, `src/lib/leaderboardSort.test.ts`, `src/components/Segmented.tsx`, `src/components/LeaderboardTable.tsx`, `src/components/leaderboard.test.tsx`

**Interfaces (Produces):**
- `sortPlayers(rows: OverallRow[], key: "wins"|"gamesPlayed"|"winRate"): OverallRow[]` — pure, descending, stable.
- `Segmented({ options: {k,label}[], value, onChange })` — the window switcher (`role="group"`, `aria-pressed`).
- `LeaderboardTable({ rows, sortKey, onSort, me })` — renders rank, name, wins/played/win%; crown (`Crown` icon) on rank 1; highlights the row where `displayName === me` with `--me-bg`.

- [ ] **Step 1: Failing test — sort** (`leaderboardSort.test.ts`, node): descending by key, stable for ties. **Step 2: Run — FAIL. Step 3: Implement `sortPlayers`** (`[...rows].sort((a,b)=>b[key]-a[key])`). **Step 4: PASS.**
- [ ] **Step 5: Failing test — component** (`leaderboard.test.tsx`, jsdom): given 3 rows + `me="You"`, the You row has the me class; rank-1 row contains the crown svg; clicking a header calls `onSort` with the right key; `Segmented` click calls `onChange`.
- [ ] **Step 6: Run — FAIL. Step 7: Implement** both components (tokened, match Home/Standings mockups). **Step 8: PASS.**
- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat(ui): Segmented + LeaderboardTable with sort/self-highlight/crown"`

---

### Task 8: GamePicker + filter/today-first logic

**Files:** Create `src/lib/gameFilter.ts`, `src/lib/gameFilter.test.ts`, `src/components/GamePicker.tsx`, `src/components/gamePicker.test.tsx`

**Interfaces (Produces):**
- `filterAndOrderGames(games: {id,name}[], query: string, dueTodayIds: string[]): { due: {id,name}[]; rest: {id,name}[] }` — pure. `due` = games in `dueTodayIds` (order by name) matching query; `rest` = the others matching query (by name). Case-insensitive substring match on `name`.
- `GamePicker({ games, dueTodayIds, onPick })` — search input (`Search` icon), a "Today · not yet logged" section (from `due`, marked "DUE"), then "All games (N)" from `rest`; calls `onPick(gameId)`.

- [ ] **Step 1: Failing test — filter** (node): `filterAndOrderGames([...], "min", ["mini"])` splits due vs rest and filters by query; empty query returns all split correctly. **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Failing test — component** (jsdom): typing in search narrows the list; a due game shows the DUE marker; clicking a row calls `onPick` with its id.
- [ ] **Step 6: FAIL. Step 7: Implement** (match `icons-picker.html`). **Step 8: PASS.**
- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat(ui): searchable GamePicker with today-first ordering"`

---

### Task 9: App shell — TabBar, Drawer, theme toggle, auth gate

**Files:** Create `src/components/TabBar.tsx`, `src/components/Drawer.tsx`, `src/components/AppShell.tsx`, `src/app/(app)/layout.tsx`, `src/components/shell.test.tsx`

**Interfaces:**
- Consumes: `useTheme` (Task 1), icons (Task 2), `getGames`/`postAuth` (Task 3).
- Produces: `TabBar({ active })` — 4 nav items (Home `/`, Standings `/standings`, You `/you`) + center `Plus` linking `/log`; marks `active`. `Drawer({ open, onClose, theme, setTheme })` — Group (disabled "coming soon"), Admin link, Settings (theme toggle ☀/☾), Help, Sign out. `AppShell({ children })` — client: holds `authed` state; if not authed renders `<SignInGate/>` (Task 10), else renders children + `TabBar` + a menu button that opens `Drawer`. `(app)/layout.tsx` wraps children in `AppShell`.

- [ ] **Step 1: Failing test** (`shell.test.tsx`, jsdom): `TabBar active="standings"` marks the Standings item current (`aria-current`); `Drawer open` shows Sign out and the theme toggle; clicking the theme toggle calls `setTheme`. (Mock `next/navigation`'s `usePathname`/`Link` as needed.)
- [ ] **Step 2: FAIL. Step 3: Implement** TabBar/Drawer/AppShell + `(app)/layout.tsx`. AppShell checks auth by calling `getGames()` on mount (401 ⇒ show gate). Menu button (top-left) toggles Drawer. Theme toggle uses `useTheme`. **Step 4: PASS.**
- [ ] **Step 5: Verify build** — `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(ui): app shell — bottom TabBar, Drawer, theme toggle, auth gate"`

---

### Task 10: Sign-in gate + remember-me

**Files:** Create `src/lib/rememberMe.ts`, `src/lib/rememberMe.test.ts`, `src/components/SignInGate.tsx`, `src/components/signInGate.test.tsx`

**Interfaces (Produces):**
- `rememberMe`: `saveName(name)`, `loadName(): string | null`, `clearName()` (localStorage key `st.displayName`).
- `SignInGate({ onAuthed })` — passphrase form → `postAuth`; on success calls `onAuthed`. Also a "who are you?" name field that pre-fills from `loadName()` and saves on change when "remember me on this device" is checked. Redesigned per the editorial gate described in the spec.

- [ ] **Step 1: Failing test — rememberMe** (jsdom, localStorage): save→load round-trips; clear removes; load returns null when unset. **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Failing test — gate** (jsdom): mock `postAuth` to succeed → submitting the passphrase calls `onAuthed`; failure shows the error copy; the name field pre-fills from a seeded `loadName`.
- [ ] **Step 6: FAIL. Step 7: Implement `SignInGate`.** **Step 8: PASS.**
- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat(ui): redesigned sign-in gate with remember-me"`

---

### Task 11: Home screen

**Files:** Create `src/app/(app)/page.tsx`, `src/components/home.test.tsx`

**Interfaces:** Consumes `getMe`, `getLeaderboard` (Task 3), `Tile`/`StatCard`/`StreakBadge` (5), `LeaderboardTable` (7), state components (6). Client component.

- [ ] **Step 1: Failing test** (`home.test.tsx`, jsdom): with `getMe` mocked to `loggedCount:3,totalCount:5` and a tile list, Home renders "3 of 5" and 5 tiles (3 solved-ish, 2 empty); with `getLeaderboard` mocked, the top standings rows render with "You" highlighted; while fetching, a `Skeleton` shows; on fetch error, `ErrorState` shows with a working Retry.
- [ ] **Step 2: FAIL. Step 3: Implement Home** — fetch `me` + weekly leaderboard on mount; render today-status card (tiles from `me.today.games`), standings snapshot (top ~4 via `LeaderboardTable` or a compact variant), and the user's top streak (`StreakBadge`). Wire loading→`Skeleton`, empty→`EmptyState` ("log today's puzzle to start"), error→`ErrorState`. Match `editorial-themes.html` Home. **Step 4: PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): Home screen (today status + standings snapshot + streak)"`

---

### Task 12: Standings screen

**Files:** Create `src/app/(app)/standings/page.tsx`, `src/components/standings.test.tsx`

**Interfaces:** Consumes `getLeaderboard`, `getBoard`, `getGames` (3); `Segmented`, `LeaderboardTable` (7); `Chip` (5); state components (6).

- [ ] **Step 1: Failing test** (jsdom): changing the `Segmented` window refetches (mock asserts `getLeaderboard` called with the new window); selecting a game chip loads its board (`getBoard` called with that id); `locked:true` renders `LockedState`.
- [ ] **Step 2: FAIL. Step 3: Implement Standings** — window `Segmented` (Daily/Weekly/Monthly/All) over the overall `LeaderboardTable` (sortable, Task 7); below, a per-game section with a game `Chip` row (or reuse compact `GamePicker`) → per-game board table (best/streak/wins). Loading/empty/locked/error states. Match `screens.html` Standings. **Step 4: PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): Standings screen (windowed leaderboard + per-game boards)"`

---

### Task 13: Log screen

**Files:** Create `src/app/(app)/log/page.tsx`, `src/components/log.test.tsx`

**Interfaces:** Consumes `getGames`, `getMe` (for due-today), `postEntry` (3); `GamePicker` (8); `Button` (5); state/error components (6).

- [ ] **Step 1: Failing test** (jsdom): pasting text and submitting calls `postEntry({displayName,pin,rawInput})`; success clears the paste box and shows a confirmation; a 422 shows the friendly parse error via `ErrorState`/inline message; picking a game in manual mode then submitting calls `postEntry` with `{gameId,value,solved,...}`.
- [ ] **Step 2: FAIL. Step 3: Implement Log** — paste-first textarea + "Log it"; manual fallback via `GamePicker` (due-today from `getMe`) + value input + solved toggle + difficulty when `hasVariants`. Needs the current display name + PIN (from remember-me / a small inline prompt). Match `screens.html` Log. **Step 4: PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): Log screen (paste-first + manual entry)"`

---

### Task 14: You screen

**Files:** Create `src/app/(app)/you/page.tsx`, `src/components/you.test.tsx`

**Interfaces:** Consumes `getMe`, `getLeaderboard` (3); `StatCard`, `StreakBadge` (5); state components (6).

- [ ] **Step 1: Failing test** (jsdom): with `getMe` + `getLeaderboard` mocked, renders the name/initial avatar, three `StatCard`s (wins from leaderboard row, best streak from `me.streaks`, win rate), a per-game streak list from `me.streaks`, and the recent-history list from `me.recent`; empty history renders `EmptyState`.
- [ ] **Step 2: FAIL. Step 3: Implement You** — header (avatar initial + name + rank from leaderboard), stat cards, per-game streaks, recent history. Loading/empty/error states. Match `screens.html` You. **Step 4: PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): You screen (stats, streaks, recent history)"`

---

### Task 15: Admin & Settings screen

**Files:** Create `src/app/(app)/admin/page.tsx`, `src/components/admin.test.tsx`

**Interfaces:** Consumes `getPlayers`, `postAdminGame`, `renamePlayer` (Task 3); `Button`, `Card` (5); state/error components (6). Reached from the Drawer's "Admin" link (Task 9). Settings (theme toggle, sign out, remembered name) live in the Drawer itself — this route is the admin forms plus a small Settings section for name/PIN.

- [ ] **Step 1: Failing test** (`admin.test.tsx`, jsdom): entering the admin passphrase + a new game and submitting calls `postAdminGame` with the passphrase and game fields; a wrong-passphrase response surfaces the error via `ErrorState`/inline message; editing a player's name and clicking Rename calls `renamePlayer(pass, id, newName)`; the player list renders from `getPlayers`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `(app)/admin/page.tsx`** — admin passphrase field; "Add a game" form (id, name, type, metricDirection, hasVariants, optional parserId) → `postAdminGame`; "Players" list from `getPlayers` with inline rename → `renamePlayer`; a small Settings block (remembered name + theme reminder). Tokened; match the calm editorial tone. Errors via `ErrorState`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): Admin & Settings screen (add game, rename players)"`

---

### Task 16: PWA — manifest, icons, offline shell

**Files:** Create `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`, `public/sw.js`; Modify `src/app/layout.tsx` (manifest + apple metas), create `src/components/ServiceWorkerRegister.tsx` (client, registers `/sw.js`), mount it in `(app)/layout.tsx`.

**Interfaces:** Produces an installable PWA with an offline app-shell. SW: cache the shell + static assets on install (cache-first for static, network-first for `/api/*` — never cache API). Offline navigation falls back to a cached shell page showing an "offline" notice.

- [ ] **Step 1:** Add `manifest.webmanifest` (name "Bragboard", short_name "Bragboard", `display:standalone`, `start_url:"/"`, theme/background from tokens, the icon set). Generate icons from the 4-tile logo mark (pine tiles on paper) — a simple square PNG set at 192/512 + maskable + apple-touch.
- [ ] **Step 2:** Add `<link rel="manifest">`, `apple-mobile-web-app-*` metas, and `apple-touch-icon` in `layout.tsx` `<head>`.
- [ ] **Step 3:** Write `public/sw.js`: `install` precaches `/`, offline fallback, and build assets; `fetch` handler = network-first for `/api/`, cache-first for same-origin static, navigation fallback to cached shell when offline.
- [ ] **Step 4:** `ServiceWorkerRegister` registers `/sw.js` on load (guarded by `"serviceWorker" in navigator`); mount in the app layout.
- [ ] **Step 5: Verify** — `npm run build` succeeds; `npm run typecheck && npm run lint && npm test` pass. (Install/offline behavior is verified on the preview deploy in Task 17 / by the owner.)
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(pwa): installable manifest, icons, and offline app shell"`

---

### Task 17: Migration + cleanup + parity

**Files:** Delete `src/app/tracker.tsx`; Modify/replace `src/app/page.tsx` (now handled by `(app)/page.tsx`); remove dead styles/exports; final sweep.

- [ ] **Step 1:** Ensure all routes live under `src/app/(app)/` behind `AppShell`; remove the old `src/app/page.tsx` Tracker mount (the `(app)/page.tsx` Home now serves `/`). Delete `src/app/tracker.tsx`.
- [ ] **Step 2:** Grep for stale references: `rg "tracker|Bricolage|Space_Mono|--font-mono"` → remove leftovers. Confirm no component hardcodes hex outside `tokens.css` (`rg "#[0-9a-fA-F]{6}" src/components src/app` → only tokens.css/icons allowed).
- [ ] **Step 3:** Full gate — `npm run typecheck && npm run lint && npm test && npm run build`. All green (120 existing + new suites).
- [ ] **Step 4:** Manual parity checklist (document in the PR): sign in (passphrase + remember-me), log via paste, log via manual, standings windows + sorting + per-game board, per-game daily lock still hides today until you log, admin (add game / rename) reachable from the drawer, theme toggle + system default, install prompt + offline shell on the preview URL.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "chore(ui): remove legacy tracker.tsx; finalize routed redesign"`

---

## Notes for the executor
- **Data the API doesn't provide** must not trigger new endpoints beyond `/api/me`. Overall wins/win-rate/rank come from the viewer's own row in `getLeaderboard`.
- **Display name + PIN**: the redesign should carry the current name via remember-me; Log still sends `{displayName, pin}` with each entry (PIN is the per-user write guard — do not remove it).
- **Visual fidelity** is judged against the approved mockups on the preview deploy, not asserted pixel-by-pixel in tests. Tests cover behavior and pure logic.
- Ship the whole branch through one preview → independent review → PR → merge at the end (per subagent-driven-development's final review + finishing-a-development-branch).
