# Daily Puzzle Scoring Tracker — Design Spec

**Date:** 2026-07-01
**Status:** Approved for planning
**Author:** Abeer Bhatia (with Claude)

## 1. Purpose

A hosted dashboard where a friend group logs their daily puzzle/game results
(Wordle, Connections, LinkedIn games, Pips, cryptics, etc.) and competes on a
shared leaderboard ranked by **games won**. Scores are entered by pasting the
raw share text ("in the format we receive data in"), which the app parses
automatically, with a manual fallback for games that lack useful share text.

The guiding product concern is **low data-entry friction** — if logging a score
is annoying, people stop and the leaderboard dies. Every decision below is
weighed against that.

## 2. Scope

### In scope (v1)
- Hosted, no-account web app for a **single friend group**.
- Shared group passphrase + pick-your-name identity, with a per-person PIN to
  prevent impersonation.
- Paste-first score entry with auto-detect + manual fallback.
- **Configurable games**: built-in parsers for a curated set, plus the ability
  to add manual-entry games via config (see §9 for the honest limits of this).
- **Sortable, filterable leaderboard** (wins, games played, win rate, streaks)
  across **Daily / Weekly / Monthly / All-time** windows, plus **per-game boards**.
- Honor-system integrity with cheap guards: PIN, daily submission lock, and an
  append-only audit trail.
- Runs entirely on **free tiers, no credit card required**.

### Deferred (roadmap — data model must not preclude these)
- 0–100 same-day performance-score model (fancier than win-counting).
- Notifications, daily recaps, win-streak column. (Participation streaks are
  in v1 — see §6.)
- Multiple independent groups / leagues (UI).
- Leaderboard caching / materialization.
- Automated backups.
- Screenshot / verified-result anti-cheat.

### Explicitly out of scope
- Real user accounts / OAuth.
- Mobile native apps (responsive web only).

## 3. Architecture

A single **Next.js** app deployed on **Vercel (Hobby, free)**, backed by
**Neon Postgres (free tier)**. React UI + Next API routes. Four internal units,
each independently testable with a clear single purpose:

| Unit | Responsibility | Depends on |
|------|----------------|-----------|
| `parsers/` | One module per game: `detect(text)` + `parse(text)`. Registry + auto-detect dispatcher. Pure functions. | nothing |
| `scoring/` | Winner determination per `(game, variant, puzzle_date)`; leaderboard aggregation over time windows. Pure functions. | nothing |
| `db/` | Schema + typed, parameterized queries via a pooled connection. | Postgres |
| `ui/` | Entry box, leaderboards, per-game boards, light admin (add game/player). | API routes |

**Why this stack:** one codebase for UI + API, push-to-deploy, huge ecosystem
for parsers/charts, and "add a game parser" stays a small contained change.
Plain Postgres + standard Next.js keeps us **portable** (see §11).

## 4. Data model

All tables carry `group_id` from day one (single group hardcoded now; no painful
tenancy migration later).

- **Group** — `id`, `name`, `passphrase_hash`, `timezone` (default the host's),
  `created_at`.
- **Player** — `id`, `group_id`, `display_name`, `pin_hash`, `created_at`.
- **Game** — `id`, `group_id`, `name`, `type` (`outcome` | `timed`),
  `metric_direction` (`lower_better` for guesses/mistakes/seconds),
  `parser_id` (nullable — null = manual-only game), `has_variants` (bool),
  `icon`, `active`, `created_at`.
  *This row is what makes games configurable.*
- **Entry** (append-only) — `id`, `group_id`, `player_id`, `game_id`,
  `variant` (nullable: `easy`/`medium`/`hard`), `puzzle_date`, `puzzle_number`
  (nullable), `raw_input` (the exact paste), `parsed_value` (seconds, or
  guesses/mistakes), `solved` (bool), `is_late` (bool), `version` (int),
  `superseded_by` (nullable FK), `created_at`.
  - The **active** entry for a `(player, game, variant, puzzle_date)` is the
    latest non-superseded row. Corrections create a new version; history is
    retained so tampering is detectable.

**Puzzle-day keying:** use the parsed `puzzle_number` when available (robust,
timezone-proof). Otherwise `puzzle_date` = calendar date in the group's
`timezone`, reset at its local midnight.

## 5. Entry pipeline (paste-first)

1. User pastes result into one box.
2. Run all game **detectors**; pick the highest-confidence match.
3. Matched parser extracts `{ puzzle_number?, variant?, value, solved }`.
4. Show a **confirmation preview** (e.g. "Wordle #1,234 — 3/6 ✓ — right?").
5. On confirm, save an Entry (new version if one already exists for the day).
6. If **no detector matches**, drop to the **manual fallback**: pick the game
   (and difficulty if `has_variants`), type the value. `raw_input` is always
   stored so we can re-parse later if a parser improves.

**Parse-failure logging:** every failed/low-confidence detect is logged so we
find out when a game changes its share format (rather than hearing it from
annoyed friends). The manual fallback keeps the app usable meanwhile.

## 6. Winner & leaderboard logic

- For each **`(game, variant, puzzle_date)`**, among **non-late active** entries,
  rank by the game's `metric_direction` (fewer guesses / fewer mistakes / faster
  time; `solved` beats unsolved). Best result **wins** that game for the day.
- **Ties** → co-wins (all tied players get a win).
- **Solo** → a single player who logs a game still wins it.
- **Leaderboard is a sortable, filterable table.** Rows are players; columns are
  metrics, each computed over the selected time window (Daily / Weekly / Monthly /
  All-time) and optionally scoped to a single game. Sort by any column; default
  sort is **Wins**. Columns:
  - **Wins** — games won (per §rules above).
  - **Games played** — count of on-time active entries.
  - **Win rate** — wins ÷ games played.
  - **Current streak** — consecutive puzzle-days (group timezone), up to the most
    recent, with ≥1 on-time active entry. A missed day breaks it.
  - **Longest streak** — the maximum such run in the window.
- **Consistency rule:** only **on-time (non-`is_late`) active entries** count
  toward *any* metric — wins, games played, and streaks alike — so the daily-lock
  anti-cheat rule can't be sidestepped via participation/streak metrics.
- All-time is framed as a "hall of fame" (it rewards longevity/volume);
  Daily/Weekly are the live competition.
- **Per-game boards** — each game has its own view (most wins, best time /
  fewest guesses, per-game streaks). For games with variants, boards are per
  difficulty.
- Every metric is a **pure function** over entries so the board can later be
  memoized / materialized without a rewrite (deferred).

## 7. Integrity (honor system + cheap guards)

Scores are self-reported — acceptable for a friend group — but three cheap
guards close the worst holes:

1. **Per-person PIN** — set on first name claim; required to post as that name.
   Kills impersonation. Stored hashed, verified server-side.
2. **Daily lock / no peeking** — a player cannot see others' results for a
   `(game, puzzle_date)` until they've submitted their own. Each puzzle-day
   **closes at reset time** (group midnight, or when the puzzle number rolls
   over); entries after close are accepted but flagged **`is_late` and excluded
   from wins** (preserves personal stats without enabling look-up-the-answer
   backfill).
3. **Append-only audit trail** — every submission/correction is a versioned row;
   nothing is silently overwritten, so tampering is detectable.

## 8. Security

- **Server-side authorization on every API route** — the group passphrase is
  enforced server-side; the group access token is **signed (HMAC/JWT)**, not a
  client-asserted flag. The API is never open just because the UI hides things.
- **Rate-limiting** on passphrase and PIN attempts (brute-force protection).
- **Parameterized queries** everywhere (SQL injection).
- **React default escaping** for all user content; never `dangerouslySetInnerHTML`
  the raw paste. (Emoji grids render fine as text.)
- **Pooled DB connection** (Neon serverless driver / pooler) from day one to
  avoid serverless connection exhaustion.
- **PII footprint** is minimal (display names only).
- Tokens in `localStorage` are XSS-readable; keeping the app free of `innerHTML`
  sinks is therefore a hard rule.

## 9. Configurable games — honest limits

- **Manual-entry games** can be added by config alone (a Game row with
  `parser_id = null`) — no deploy.
- **Auto-parse games** need a new parser module = **code + deploy**. Friends
  cannot self-add an auto-parsing game; only the maintainer can, via a release.
- This is acceptable, but stated plainly so "configurable" isn't oversold.

## 10. Error handling & edge cases

- Ambiguous/failed parse → manual fallback; the paste is never lost.
- Re-submitting the same game/day → "update your entry?" → new version.
- Garbage paste → clear inline message.
- Late entry (after puzzle close) → saved, flagged `is_late`, excluded from wins.
- Timezone disagreement → resolved by puzzle-number keying, else group timezone.
- Parser drift → parse-failure logging + manual fallback.

## 11. Cost & upgrade path

**v1 target: $0, no credit card on file.**

| Component | Free tier | What would ever trigger cost | Graceful upgrade |
|-----------|-----------|------------------------------|------------------|
| Hosting | Vercel Hobby | Going commercial, or huge bandwidth/compute (a friend group won't) | Vercel Pro (~$20/mo) |
| Database | Neon free (autosuspends, wakes on request) | Outgrowing storage (text entries → years away) | Neon paid tier, or move (portable Postgres) |
| Domain | `*.vercel.app` ($0) | Wanting a custom domain (vanity only) | ~$10/yr domain |
| Scheduled jobs | none — locking is computed from timestamps | Needing real cron (notifications, etc.) | Vercel Cron (free tier) |

**Principles:** (1) *Free-tier-first, no card* — every dependency must have a
real free tier and no silent-billing component. (2) *Portable* — plain Postgres
+ standard Next.js so any future paid upgrade or host move is not a rewrite.

## 12. Testing

- **Parsers** (highest bug risk): unit tests with **real captured share-text
  fixtures** per game, including tricky cases — Wordle fails (`X/6`), Pips' three
  difficulties, Connections grids, LinkedIn time formats, Patches.
- **Scoring/win logic**: unit tests for ties, solo wins, unsolved, late-exclusion,
  and per-variant grouping.
- **Leaderboard metrics**: unit tests for each sortable column (wins, games
  played, win rate, current/longest streak), including streak-break on a missed
  day and the on-time-only consistency rule.
- **Auth**: tests that API routes reject missing/invalid tokens and enforce PINs.
- **End-to-end**: one light flow — paste → confirm → save → appears on leaderboard.

## 13. First set of games to ship (v1)

Auto-parse: **Wordle, Connections, Strands, Pips (Easy/Med/Hard), NYT Mini,
Minute Cryptic, LinkedIn Queens / Tango / Zip / Pinpoint / Crossclimb /
Mini Sudoku / Patches.**
Manual fallback covers everything else from day one (The Hindu, India mini, etc.).
