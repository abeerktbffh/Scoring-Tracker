# Expandable Today Card (F002 + per-game today score/rank) — Design Spec

**Status:** Approved (owner, 2026-07-23)
**Delivers:** feature **F002** ("Links to games") + a per-game "today" detail view, by making Home's Today card **tap-to-expand**. Supersedes the earlier "links on the tiles" idea — the play links now live inside the expanded card.

## Goal

Home's Today card stays exactly as it is at a glance, but tapping it reveals, for each game: **today's score**, **your rank today**, and a small **play icon** to open the game (play → share → auto-log). One tap gives a "how am I scoring / ranking everywhere today" view without leaving Home.

## Behaviour

### Collapsed (unchanged)
The current Today card, untouched: `"N of M done"`, the completed/still-to-play chips (or the existing tiles + "Still to play" line — match the current production layout), and the streak row. The only addition is a subtle expand affordance (a chevron) and the whole card becomes tappable/keyboard-activatable.

### Expanded
A panel below the card (revealed in place) with one row per tracked game:
- **Game name.**
- **Today's score** — the viewer's result for today's puzzle, formatted with `formatResult` (e.g. `3/6 ✓`, `1:12`, `2 mistakes`, `no hints`). Not played today → `"Not played today"`.
- **Your rank today** — the viewer's position in *today's* per-game contest, shown as `"Nth of M"` and tinted for 1st/2nd/3rd (gold/silver/bronze — reuse the app's medal palette). Not played (or no contest) → `"—"`.
- **Play icon** — a small icon-only link (NO "Play" text), opens the game's URL in a new tab (`target="_blank" rel="noopener"`). Shown only for games that have a URL in the map (below).

Rank window is **today (the daily contest)** — not weekly/all-time.

## Data

- **Today's score** per game: the viewer's today result. Already derivable from the `/api/me` "today" data path (currently returns per-game `logged`; extend it to also carry the viewer's value/solved/detail for today).
- **Today's rank** per game: the viewer's dense-rank in today's per-game contest — this is the new server work. It requires *all players'* today entries per game, ranked with the existing daily-contest logic (reuse `computeDailyContest`/`medals.ts` ranking, `superseded_by IS NULL`, `is_late = false`, keyed by `gameId|puzzle_date=today`), then find the viewer's position + the field size.
- **Delivery:** extend the existing `GET /api/me` response with a per-game "today detail" array — `{ gameId, name, played, valueFormatted, solved, rank, playerCount }` — computed server-side (session-scoped viewer; optional `?group=` already handled by that route). No new client round-trip; the expanded panel reads from the data Home already fetches. (The plan may instead add a focused `/api/me/today` endpoint if that keeps `me` cleaner — an implementation choice, not a design change.)
- **Play URLs:** a hardcoded `gameId → url` map in code (NO `games.url` schema column). Seed with the known links; games without a map entry simply show no play icon.
  - **Confident:** wordle `nytimes.com/games/wordle/index.html` · connections `nytimes.com/games/connections` · strands `nytimes.com/games/strands` · pips `nytimes.com/games/pips` · queens/tango/pinpoint/crossclimb/zip `linkedin.com/games/<slug>/` · minute-cryptic `minutecryptic.com` · india-mini `indiamini.in/play/` · hindu-mini `thehindu.com/crosswords/thehindu-mini-crossword/` · easy-down `thehindu.com/crosswords/hindu-one-down/`.
  - **Best-guess (owner to verify, else drop):** mini-sudoku, patches, wend (LinkedIn slugs unconfirmed).

## Constraints / scope

- **No schema migration** (play URLs live in code; rank computed from existing entries).
- **Ranking scalar untouched** — reuse existing daily-contest ranking; display-only.
- **YAGNI:** only Home's Today card. No dedicated "Play" screen; Log-picker/Standings links out of scope.
- **Collapsed card visually unchanged**; expand adds no layout shift when collapsed.
- **Accessibility:** the card is a real button/`role=button` with `aria-expanded`; the reveal respects `prefers-reduced-motion`; the play icon has an accessible label ("Open <game>").

## Testing

- **Pure logic (unit-tested):** the per-game today assembly (given the viewer's entries + all today entries per game → `{played, valueFormatted, solved, rank, playerCount}`) reusing `formatResult` + the daily-contest ranking; the `gameId→url` map lookup; the "Not played today" / no-rank fallbacks.
- **Server:** the extended `/api/me` (or `/api/me/today`) returns correct per-game today detail (rank matches the daily-contest board; session-scoped).
- **Component (jsdom):** the card toggles expanded/collapsed; the play icon is an anchor to the mapped URL with `target=_blank`; not-played rows render fallbacks.
- Owner-visible acceptance on a draft PR / preview (visual).

## Rollout

Code-only (app feature); no schema/DB migration. Merges via the usual gated PR + owner go-ahead. Built via the normal plan → subagent-driven flow.

## Out of scope / deferred

- Making the tiles/chips in the collapsed card individually tappable (the expanded panel is the interaction surface).
- Rank windows other than today (weekly/all-time) — the expanded view is today-only; the Standings screen already covers other windows.
- A `games.url` DB column (revisit only if URLs need to be owner-editable without a deploy).
