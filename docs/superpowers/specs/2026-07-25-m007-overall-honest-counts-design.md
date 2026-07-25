# M007 — Overall board shows honest participation — Design Spec

**Status:** Approved (owner, 2026-07-25)
**Delivers:** tracker item **M007** [High] "Overall leaderboard numbers."

## Problem

On the Board screen the **Overall + Today** view is gated by "no-peek": the daily-window
leaderboard route runs a dedicated "what did the *viewer* play today" query and then
filters every player's rows down to only the games the viewer played today (and locks the
whole board if the viewer has played nothing yet). As a side effect, another player's
**"Played" count is capped by the viewer's own participation** — you cannot see how many of
today's games someone else has actually logged. That is the reported bug: "the overall daily
board only shows the count of games depending on the total games the viewer has played."

## Decision

On the **overall** leaderboard, **remove no-peek entirely**. The board shows every player's
honest, viewer-independent participation and today's medal leaders, and is never locked.

- **Overall + Today** then shows, for every player: how many of *today's* games they logged
  (the "Played" count) and their medals across *all* of today's per-game contests.
- Because `computeOverallMedals` already derives both the medal tally and `gamesPlayed` from
  the entries it is given, removing the filter makes both numbers honest automatically — no
  new query or scoring change is needed.
- The board is **never locked** for the overall view (the lock only ever came from the
  no-peek daily branch).

This is the owner's explicit "show everything" choice: on the overall board it is acceptable
to see who is leading today's puzzles before you have played them.

## Deliberate asymmetry (owner-approved)

No-peek is **kept on the per-game boards**. Tapping into a *specific* game's **Today** board
is still locked until the viewer has logged that game that day. Rationale: the overall board
reveals only *rankings + participation*, whereas a single game's board reveals *exact scores*
(times/guesses) — the real spoiler. So:

- **Overall board** → shows everything (rankings + participation), never locked.
- **Individual game board** → still play-to-reveal for that game's exact scores.

Clause 2 of the tracker item ("individual game leaderboards should be restricted to people
who have logged that specific game") is **already satisfied** by the existing per-game board
route, which only ever selects entries `WHERE game_id = <that game>` — a player who never
logged the game does not appear. No code change is required for clause 2.

## Scope

**In scope — `src/app/api/leaderboard/route.ts` only:**
- Delete the daily-window no-peek block: the dedicated `SELECT DISTINCT game_id ...
  WHERE user_id = viewer AND puzzle_date = today` query, the `visibleRows` filtering, and the
  `locked` computation.
- `visibleRows` becomes simply all `rows`; `locked` is always `false`.
- Applies identically to the default (global) and `?group=<id>` scoped code paths — the
  no-peek block is shared after the row query, so removing it fixes both.
- The response shape is unchanged (`{ window, locked, players, viewerName }`); `locked` is
  now always `false` for this route.

**Not changed:**
- `src/app/api/games/[gameId]/board/route.ts` — per-game no-peek and player-restriction stay
  exactly as they are.
- `src/scoring/medals.ts` (`computeOverallMedals`, `gamesPlayed`, medal logic) — untouched;
  the honest numbers come from feeding it the unfiltered rows.
- The daily SQL row set is already correct: `windowStart("daily", today)` returns `today`, so
  the query already pulls only today's entries across all players and games.
- Weekly / monthly / all-time windows — already never no-peek gated; unchanged.

**UI (`standings/page.tsx`, `LeaderboardTable`, `LockedState`):** no change needed. The
overall `LockedState` branch simply never fires now (dead but harmless); the "Played" column
already renders `gamesPlayed`. No new fields.

## Constraints

- No schema migration; no scoring-scalar change; reads stay session-scoped (viewer from
  session; `?group=` handled as today).
- Access control unchanged: `requireUser()` (401 signed-out) / `requireMember()` (403
  non-member) still gate the route. Removing no-peek changes *visibility of participation*,
  not *who may call the endpoint*.
- YAGNI: overall leaderboard route only.

## Testing

Update `src/app/api/leaderboard/leaderboard.test.ts`:

- **Remove/replace** the assertions that lock the daily overall board when the viewer has
  played nothing (currently `locked: true`), and the ones asserting no-peek *narrows* the
  medal tally to the viewer's played games. These describe the behavior being removed.
- **Remove** the now-dead "dedicated played-today query" mock steps for the daily-window
  cases (the route no longer issues that query).
- **Add**: on the daily window, `locked` is always `false`; every player's `gamesPlayed`
  reflects *all* of their today entries (not capped by the viewer); the medal tally reflects
  *all* of today's per-game winners regardless of what the viewer played. Include a case where
  the viewer has played nothing today and the board still returns all players honestly.
- **Keep**: aggregate-window (weekly/monthly/all) behavior, group scoping, and access-control
  (401/403) tests unchanged and still green.

## Rollout

Code-only, no migration. Gated PR + owner go-ahead: backup tag → PR → CI `verify` → owner
approves → squash-merge → prod health check. Owner verifies on the live Board (Overall +
Today now shows every player's true games-played count and today's medals, and is not locked
before they play).
