# Front-end / UX Overhaul (Workstream B) — Design Spec

**Date:** 2026-07-02
**Status:** Approved for planning
**Workstream:** B of the [roadmap](2026-07-02-roadmap-design.md)

## Goal

A full visual and structural rethink of the app, establishing a **design system**
(tokens, typography, components, icon set, light/dark themes) and an **app-like
information architecture** (bottom tab bar + drawer) that later workstreams — especially
multi-group (C) — build on. Ship it as an **installable PWA** with an offline shell and
**first-class empty/locked/error/loading states**. No backend or data-model changes; the
existing API and Neon schema are reused as-is.

This is a redesign, not a feature workstream: the same capabilities (log a result, view
standings, per-game boards, streaks, admin) are re-expressed in a new, coherent, mobile-first
shell that replaces the single-file `tracker.tsx`.

## Scope decisions (resolved in brainstorming, 2026-07-02)

- **Direction:** full rethink (not a refine). Friends are expected to adopt a clearly-better app.
- **Identity/visual language:** "Editorial Puzzle" — refined typographic feel native to the
  daily-puzzle world, with a tile motif (solved / partial / empty).
- **Palette:** **Pine & Amber** (primary `#10756a` pine, secondary `#e0952f` amber) — deliberately
  *not* Wordle's green/gold. Tile motif reused; colors are ours.
- **Themes:** light **"Paper"** + dark **"Ink"** (warm near-black, not cold gray). Follows the
  device's system setting by default; a manual toggle in Settings overrides and persists.
- **Type:** **Fraunces** (display serif) + **Inter** (UI/labels/data), via `next/font` (self-hosted).
- **Navigation:** **bottom tab bar** (Home · Standings · **➕ Log** center action · You) + a
  slide-in **drawer** (Group [stub for C] · Admin · Settings · Help · Sign out).
- **Icons:** a **custom inline-SVG icon set** themed in Pine/Amber (flame=streak, crown=leader,
  tick=solved, trophy=win, etc.). No OS emoji in chrome; emoji only appear inside user-pasted text.
- **PWA:** installable (manifest + icons) with an **offline shell**. **Push notifications are
  deferred to workstream F.**
- **States:** **first-class** empty / locked / error / loading (skeletons) across all screens.
- **Auth for B:** keep the current **shared group passphrase + per-user name+PIN**, wrapped with
  **"remember me"** (device remembers who you are; the existing 30-day group session cookie keeps
  you signed in). **The magic-link / accounts rebuild is a separate following sub-project**, not
  part of B. This spec must not remove or reshape the auth model in a way that blocks that rebuild.

## Global constraints

- **No schema changes; one additive read-only endpoint allowed.** Reuse `GET /api/games`,
  `GET /api/leaderboard`, `GET /api/games/:id/board`, `GET /api/players`, `POST /api/auth`,
  `POST /api/entries`, `POST /api/admin/*` unchanged. The Home "N of M logged today" + tile row and
  the You screen's per-game streaks and recent history need per-user data none of those expose, so
  this workstream adds **one** new read-only endpoint, **`GET /api/me?player=<displayName>`**
  (decision 2026-07-02) — no writes, no schema change. No other API/schema change is in scope.

### New endpoint: `GET /api/me?player=<displayName>`
Read-only. Group from the `group_token` cookie (401 if absent), viewer by the `player` display-name
query param (same honor-system pattern as the existing `player` param — reads are group-shared,
per-user PIN only guards writes). Returns, computed from existing tables via existing scoring helpers:
```json
{
  "today": { "date": "2026-07-02", "loggedCount": 3, "totalCount": 5,
             "games": [ { "gameId": "wordle", "name": "Wordle", "logged": true }, … ] },
  "streaks": [ { "gameId": "wordle", "name": "Wordle", "currentStreak": 7, "longestStreak": 12 }, … ],
  "recent":  [ { "gameId": "wordle", "name": "Wordle", "variant": null, "value": 3,
                 "solved": true, "puzzleDate": "2026-07-02" }, … ]  // most-recent first, capped at 10
}
```
`today.games` lists the group's **active** games with whether the viewer logged each **today**;
`streaks` are per game for the viewer (reusing the existing streak computation); `recent` is the
viewer's last 10 on-time active entries, newest first. Overall wins/win-rate/rank continue to come
from `GET /api/leaderboard` (the viewer's own row), not from `/api/me`.
- **Keep the 120-test suite green.** Parser/logic tests are unaffected; add component tests for new
  UI where they carry weight.
- **Secret-free build preserved** (lazy DB client, Sentry no-ops without DSN) — the CI gate from
  workstream A must stay green.
- **Free-tier only.** Fonts and icons are self-hosted/inline (no external CDN at runtime; matches
  the Sentry-era CSP-friendliness and offline shell).
- **Accessibility floor:** WCAG AA contrast in both themes, visible keyboard focus, `prefers-reduced-motion`
  respected, semantic landmarks, labelled controls.
- Ships on `feat/frontend-overhaul` → preview → PR → merge, through the workstream-A pipeline
  (CI `verify` + independent review gate).

## Design system

The foundation everything else consumes. Built once, first.

### Tokens (`src/design/tokens.css` or equivalent)
CSS custom properties, themed via a `data-theme="light|dark"` attribute on `<html>` plus a
`@media (prefers-color-scheme)` default. Token groups:
- **Color:** `--bg`, `--surface`, `--ink` (text), `--muted`, `--line` (borders), `--accent` (pine),
  `--accent-2` (amber), `--tile-solved`, `--tile-partial`, `--tile-empty`, `--me` (self-highlight),
  plus dark-theme values. Exact values from the approved mockups:
  - Light: bg `#fffdf7`, surface `#ffffff`, ink `#1a1710`, muted `#8a7f66`, line `#ece5d5`,
    accent `#10756a`, accent-2 `#e0952f`, tile-empty `#efe9db`, me-bg `#e2f0ed`.
  - Dark: bg `#17150e`, surface `#211e15`, ink `#f2ecdd`, muted `#a99a78`, line `#2b271b`,
    accent `#17a08f`, accent-2 `#e0952f`, tile-empty `#2b271b`, me-bg `#16302b`.
- **Type scale:** Fraunces for display/headings and large numbers; Inter for labels, data, and
  body. Define `--font-display`, `--font-ui`, and a modular size scale.
- **Space / radius / shadow:** an 8px-based spacing scale, radius tokens (tiles `~4px`, cards `~16px`,
  pills `99px`), and one elevation token for cards/sheets.

### Theme control
- Default = system (`prefers-color-scheme`).
- Manual override persisted (localStorage `theme`), applied pre-paint to avoid a flash (inline
  script in `layout.tsx` sets `data-theme` before hydration).
- Toggle lives in drawer → Settings.

### Icon set (`src/design/icons.tsx`)
Inline-SVG React components, single stroke system, colored via `currentColor`: `Flame`, `Crown`,
`Check`, `AlertDot`, `Trophy`, `Search`, `Plus`, `Chevron`, plus tab icons (Home, Board, You, Menu).
No external icon dependency.

### Component library (`src/components/`)
Small, focused, theme-token-driven, each independently testable:
`Button` (primary/amber/ghost), `Card`, `Segmented` (window switcher), `Chip`,
`Tile`/`TileRow` (solved/partial/empty), `LeaderboardTable` (sortable, self-highlight, rank/crown),
`StatCard`, `StreakBadge`, `EmptyState`, `LockedState`, `ErrorState`, `Skeleton`,
`TabBar`, `Drawer`, `Sheet` (for Log/pickers), `GamePicker` (searchable, today-first).

## Information architecture

Authenticated shell = a persistent **TabBar** (bottom) + **Drawer** (hamburger, top-left).
Each tab is an App Router route under a shared authenticated layout, giving real URLs (good for
PWA/deep-linking) and code-splitting.

- **Home** (`/`) — today's status ("3 of 5 logged" with tile row), a standings snapshot (top rows,
  self highlighted), and the user's live streak. The hub; leans rivalry + daily ritual.
- **Standings** (`/standings`) — overall league table with a windowed `Segmented`
  (Daily/Weekly/Monthly/All) and sortable columns (wins/played/win%), self-highlighted, crown on #1;
  below it, a per-game section with a searchable game selector → per-game board (best, streak, wins).
- **Log** (`/log`, the center ➕) — **paste-first**: a large paste area that auto-detects the game
  via the existing parser registry, then a "Log it" action; **manual fallback** below via the
  searchable `GamePicker` (today's unlogged games surfaced first, then the full list), value input,
  solved toggle, and difficulty when applicable.
- **You** (`/you`) — identity (name + avatar initial), headline stats (wins, best streak, win rate,
  current rank), per-game streaks, and recent history.
- **Drawer** — **Group** name + *switch group* (visible but disabled/"coming soon" stub, wired for C);
  **Admin** (add game, rename players — moved out of the main flow, shown to anyone with the admin
  passphrase); **Settings** (your name/PIN, theme toggle); **Help/About**; **Sign out**.

### Unauthenticated gate
A redesigned sign-in screen: group passphrase entry, brand, then "who are you?" (name + PIN) with a
**"remember me on this device"** option. On success the existing group session cookie persists and
the name is stored locally so return visits skip re-entry (PIN still required to submit entries; may
be pre-filled if remember-me is on).

## First-class states

For every data surface, define and build:
- **Loading:** skeletons matching the eventual layout (no spinners-on-blank).
- **Empty:** e.g. "No entries yet — log today's Wordle to start the board" with a direct action.
- **Locked:** the existing per-game daily no-peek, redesigned ("Log today's puzzle to reveal
  today's standings") — an invitation, not a dead end.
- **Error:** friendly, actionable, in the app's voice ("Couldn't load standings — retry"), never a
  raw failure. Wire client fetch failures here (and they already flow to Sentry server-side).

## PWA / installability

- `public/manifest.webmanifest`: name, short_name, theme/background colors (per active theme),
  `display: standalone`, start_url, icons.
- App icons (maskable + standard) generated from the tile-mark logo, in `public/`.
- A **service worker** (via `next-pwa` or a hand-rolled minimal SW) caching the **app shell** and
  static assets for an offline shell; API responses are network-first (data must be fresh). Offline =
  the shell loads with a clear "you're offline" state, not a browser error page.
- `apple-touch-icon` + iOS meta so add-to-home-screen works on iPhone.
- No push in this workstream.

## Component architecture & migration

- Replace the monolithic `src/app/tracker.tsx` with the routed shell + focused components above.
  Delete `tracker.tsx` once parity is reached.
- Data fetching: a thin client API layer (`src/lib/api.ts`) wrapping the existing endpoints, with
  typed responses and consistent error surfacing into `ErrorState`.
- Keep `src/app/layout.tsx` as the theme/font root; add the pre-paint theme script and `next/font`
  faces there.
- No changes under `src/app/api/**`, `src/parsers/**`, `src/db/**`, or `src/lib` domain logic
  except additive client helpers.

## Testing

- Existing 120 tests stay green (they cover parsers/logic, untouched here).
- Add focused component/interaction tests (Vitest + Testing Library) for the pieces where logic
  lives in the UI: `LeaderboardTable` sorting + self-highlight, `Segmented` window switching,
  `GamePicker` search + today-first ordering, theme toggle persistence, and each state component
  rendering. Visual polish itself is validated on the preview deployment, not asserted in tests.

## Accessibility

AA contrast verified in both themes (the mockup palettes were chosen with this in mind); visible
focus rings; `prefers-reduced-motion` disables non-essential animation; semantic `<nav>`/`<main>`,
labelled inputs, and the tab bar exposed as a proper navigation with current-tab state.

## Out of scope (tracked elsewhere)

- **Identity rebuild** (magic-link / light accounts) — the immediately-following sub-project;
  B only adds "remember me" over the current model and must not block it.
- **Push notifications / reminders / nudges** — workstream F.
- **Multi-group** creation/switching — workstream C (the drawer entry is a disabled stub).
- **Auto-import** — workstream E.
- Any API/schema change; any new game or parser.

## Success criteria

- The app is comfortably usable and **installable** on a phone; launched from the home screen it
  opens in standalone with the offline shell working.
- Light/dark both look polished, follow the system setting, and can be toggled + remembered.
- Every screen has real loading/empty/locked/error states — no blank flashes or raw errors.
- The monolithic `tracker.tsx` is gone, replaced by a tokened design system + focused components
  that workstream C can extend without re-theming.
- CI `verify` stays green; the redesign ships through preview → review → merge with no backend change.

## Open questions (resolved)

- Redesign depth → **full rethink**. Palette → **Pine & Amber**. Themes → **light+dark, system default + toggle**.
- Nav → **bottom tabs + drawer**. Notifications → **deferred to F**. States → **first-class**.
- Auth → **remember-me over current model; identity rebuild is a separate next sub-project**.
