# M007 — Overall board honest participation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove no-peek from the Overall leaderboard route so **Overall + Today** shows every player's honest games-logged-today count and today's medal leaders, and is never locked.

**Architecture:** Delete the daily-window no-peek block from `src/app/api/leaderboard/route.ts` (the dedicated "viewer played today" query, the `visibleRows` filter, and the `locked` computation). `computeOverallMedals` already derives both `gamesPlayed` and the medal tally purely from the entries it's given, so feeding it the unfiltered `rows` makes both honest with no scoring change. `locked` becomes a literal `false`. The `?group=` path shares the same post-query block, so one removal fixes both paths. No schema, no scoring, no UI change.

**Tech Stack:** Next.js 14.2 App Router (route handler), TypeScript, Neon stateless `sql` HTTP driver, Vitest.

## Global Constraints

- **No schema migration**; no scoring-scalar change; reads stay session-scoped (viewer from session; `?group=` handled as today).
- **Access control unchanged:** `requireUser()` → 401 signed-out; `requireMember()` → 403 non-member. The DB is never touched before the guard passes.
- **Only `src/app/api/leaderboard/route.ts` and its test change.** Do NOT touch `src/app/api/games/[gameId]/board/route.ts`, `src/scoring/medals.ts`, `src/scoring/noPeek.ts`, or any UI file.
- **Response shape unchanged:** `{ window, locked, players, viewerName }`. `locked` is now always `false` for this route.
- Per-player row shape unchanged: `{ displayName, gold, silver, bronze, gamesPlayed, gamesLed }`.

---

## Task 1: Remove no-peek from the Overall leaderboard route

**Files:**
- Modify: `src/app/api/leaderboard/route.ts` (delete the daily no-peek block + the now-unused `viewerUserId`; update the header docstring; use `rows` instead of `visibleRows`; return `locked: false`).
- Test: `src/app/api/leaderboard/leaderboard.test.ts` (rewrite the no-peek/locked tests; delete the vacuous one; add honest-count coverage).

**Interfaces:**
- Consumes: `computeOverallMedals(entries: GameEntry[]): OverallMedalStat[]` from `@/scoring/medals` — returns per player `{ playerId, gold, silver, bronze, gamesPlayed, gamesLed }`, where `gamesPlayed` = number of entries for that player and the tally comes from `tallyMedals`. Both are pure functions of the passed `entries`.
- Consumes: `windowStart(window, today)` — for `"daily"` returns `today` (so the SQL already selects only today's rows).
- Produces: response `{ window, locked: false, players, viewerName }`.

### Steps

- [ ] **Step 1: Rewrite the test file to the new behavior (RED).**

Replace the entire contents of `src/app/api/leaderboard/leaderboard.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const requireMemberMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({
  requireUser: requireUserMock,
  requireMember: requireMemberMock,
}));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

function req(url = "http://localhost/api/leaderboard"): Request {
  return new Request(url);
}

const USER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u_session",
    displayName: "Session Player",
    isSuperAdmin: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/leaderboard", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the leaderboard shape for an authenticated user", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        game_id: "g_wordle",
        variant: null,
        puzzle_date: "2026-07-01",
        parsed_value: 4,
        solved: true,
        metric_direction: "lower_better",
      },
    ]); // entries — the ONLY query the route issues now (no-peek removed)

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      window: "daily",
      locked: false,
      players: [
        { displayName: "Session Player", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1, gamesLed: ["g_wordle"] },
      ],
      viewerName: "Session Player",
    });

    // Query joins `users` (not `players`) and has no group_id filter.
    const queryText = sqlMock.mock.calls[0][0].join(" ");
    expect(queryText).toMatch(/JOIN users u ON u\.id = e\.user_id/);
    expect(queryText).not.toMatch(/players/i);
    expect(queryText).not.toMatch(/group_id/i);
    expect(queryText).toMatch(/u\.display_name IS NOT NULL/);
    // Exactly one query — the dedicated played-today query is gone.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("daily Overall shows all players honestly even when the viewer has played nothing (no-peek removed)", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_other",
        display_name: "Other User",
        game_id: "g_wordle",
        variant: null,
        puzzle_date: "2026-07-01",
        parsed_value: 4,
        solved: true,
        metric_direction: "lower_better",
      },
    ]);

    const res = await GET(req());
    const body = await res.json();
    // The viewer (u_session) has no entries, but the board is NOT locked and
    // other players are shown honestly.
    expect(body.locked).toBe(false);
    expect(body.players).toEqual([
      { displayName: "Other User", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1, gamesLed: ["g_wordle"] },
    ]);
    // No dedicated played-today query is issued.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("each player's gamesPlayed reflects their OWN games, uncapped by the viewer", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    // Viewer played 1 game today; Other played 3. Under the old no-peek rule
    // Other's count would have been capped to the viewer's played games (1).
    sqlMock.mockResolvedValueOnce([
      { user_id: "u_session", display_name: "Session Player", game_id: "g_wordle", variant: null, puzzle_date: "2026-07-01", parsed_value: 4, solved: true, metric_direction: "lower_better" },
      { user_id: "u_other", display_name: "Other Player", game_id: "g_wordle", variant: null, puzzle_date: "2026-07-01", parsed_value: 3, solved: true, metric_direction: "lower_better" },
      { user_id: "u_other", display_name: "Other Player", game_id: "g_connections", variant: null, puzzle_date: "2026-07-01", parsed_value: 10, solved: true, metric_direction: "higher_better" },
      { user_id: "u_other", display_name: "Other Player", game_id: "g_strands", variant: null, puzzle_date: "2026-07-01", parsed_value: 1, solved: true, metric_direction: "lower_better" },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.locked).toBe(false);
    const other = body.players.find((p: { displayName: string }) => p.displayName === "Other Player");
    const session = body.players.find((p: { displayName: string }) => p.displayName === "Session Player");
    expect(other.gamesPlayed).toBe(3);
    expect(session.gamesPlayed).toBe(1);
  });

  it("uses requireUser and the global query when ?group= is absent", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]);

    await GET(req());
    expect(requireUserMock).toHaveBeenCalled();
    expect(requireMemberMock).not.toHaveBeenCalled();
  });

  it("403s a non-member requesting ?group=g1, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(req("http://localhost/api/leaderboard?group=g1"));
    expect(res.status).toBe(403);
    expect(requireMemberMock).toHaveBeenCalledWith("g1");
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("scopes the entries query to the group and tracked-active games for a member", async () => {
    requireMemberMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        game_id: "g_wordle",
        variant: null,
        puzzle_date: "2026-07-01",
        parsed_value: 4,
        solved: true,
        metric_direction: "lower_better",
      },
    ]);

    const res = await GET(req("http://localhost/api/leaderboard?group=g1"));
    expect(res.status).toBe(200);
    expect(requireMemberMock).toHaveBeenCalledWith("g1");

    const call = sqlMock.mock.calls[0];
    const queryText = call[0].join(" ").replace(/\s+/g, " ");
    expect(queryText).toMatch(
      /AND e\.user_id IN \(SELECT user_id FROM memberships WHERE group_id = /,
    );
    expect(queryText).toMatch(
      /AND e\.game_id IN \( SELECT gg\.game_id FROM group_games gg JOIN games ga ON ga\.id = gg\.game_id AND ga\.active = true WHERE gg\.group_id = /,
    );
    expect(call.slice(1)).toContain("g1");
  });

  it("a group-scoped daily board shows members honestly and is never locked (no-peek removed)", async () => {
    requireMemberMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_other",
        display_name: "Other User",
        game_id: "g_wordle",
        variant: null,
        puzzle_date: "2026-07-01",
        parsed_value: 4,
        solved: true,
        metric_direction: "lower_better",
      },
    ]);

    const res = await GET(req("http://localhost/api/leaderboard?group=g1"));
    const body = await res.json();
    expect(body.locked).toBe(false);
    expect(body.players).toEqual([
      { displayName: "Other User", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1, gamesLed: ["g_wordle"] },
    ]);
    // Only the entries query runs — no dedicated played-today query.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("computes a cross-game Overall medal tally (gold/silver/bronze, gamesPlayed, gamesLed) for window=weekly", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      // Wordle: Session wins (lower is better).
      { user_id: "u_session", display_name: "Session Player", game_id: "g_wordle", variant: null, puzzle_date: "2026-07-01", parsed_value: 3, solved: true, metric_direction: "lower_better" },
      { user_id: "u_other", display_name: "Other Player", game_id: "g_wordle", variant: null, puzzle_date: "2026-07-01", parsed_value: 5, solved: true, metric_direction: "lower_better" },
      // Connections (same puzzle day): Other wins (higher is better).
      { user_id: "u_other", display_name: "Other Player", game_id: "g_connections", variant: null, puzzle_date: "2026-07-01", parsed_value: 10, solved: true, metric_direction: "higher_better" },
      { user_id: "u_session", display_name: "Session Player", game_id: "g_connections", variant: null, puzzle_date: "2026-07-01", parsed_value: 2, solved: true, metric_direction: "higher_better" },
    ]);

    const res = await GET(req("http://localhost/api/leaderboard?window=weekly"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window).toBe("weekly");
    expect(body.players).toEqual(
      expect.arrayContaining([
        { displayName: "Session Player", gold: 1, silver: 1, bronze: 0, gamesPlayed: 2, gamesLed: ["g_wordle"] },
        { displayName: "Other Player", gold: 1, silver: 1, bronze: 0, gamesPlayed: 2, gamesLed: ["g_connections"] },
      ]),
    );
    expect(body.players).toHaveLength(2);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("today's Overall reflects ALL today's per-game winners (no-peek removed)", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      { user_id: "u_session", display_name: "Session Player", game_id: "g_wordle", variant: null, puzzle_date: "2026-07-01", parsed_value: 3, solved: true, metric_direction: "lower_better" },
      { user_id: "u_other", display_name: "Other Player", game_id: "g_connections", variant: null, puzzle_date: "2026-07-01", parsed_value: 10, solved: true, metric_direction: "higher_better" },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.window).toBe("daily");
    expect(body.locked).toBe(false);
    // Both players' games count — Other's g_connections gold is NO LONGER
    // hidden (previously no-peek narrowed the tally to the viewer's games).
    expect(body.players).toEqual(
      expect.arrayContaining([
        { displayName: "Session Player", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1, gamesLed: ["g_wordle"] },
        { displayName: "Other Player", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1, gamesLed: ["g_connections"] },
      ]),
    );
    expect(body.players).toHaveLength(2);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they FAIL against the current route.**

Run: `npx vitest run src/app/api/leaderboard/leaderboard.test.ts`
Expected: FAIL. The current route still issues the dedicated played-today query and locks/filters on the daily window, so (among others) "daily Overall shows all players honestly…" fails (`locked` is `true`, `players` is `[]`), and the `toHaveBeenCalledTimes(1)` assertions fail (the route makes 2 calls). This proves the tests exercise the new behavior.

- [ ] **Step 3: Rewrite the route to remove no-peek (GREEN).**

Replace the entire contents of `src/app/api/leaderboard/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser, requireMember } from "@/lib/membership";
import { PLATFORM_TZ } from "@/lib/group";
import { computeOverallMedals } from "@/scoring/medals";
import type { GameEntry } from "@/scoring/wins";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

/**
 * The board is global by default: access is gated by session identity
 * (`requireUser`), not group membership. `requireUser` re-resolves identity
 * from the DB on every call: no session -> 401.
 *
 * An optional `?group=<id>` scopes the board to that group's members and
 * tracked-active games; access is then gated by `requireMember` (403 for
 * non-members).
 *
 * The Overall board is never no-peek gated (M007): it shows every player's
 * honest participation (games played) and the day's medal leaders regardless
 * of what the viewer has played, and is never locked. No-peek stays only on
 * the per-game board, which reveals exact scores.
 */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("group");
  const guard = groupId ? await requireMember(groupId) : await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";
  const today = localDateInTz(PLATFORM_TZ);
  const start = windowStart(window, today);

  const rows = (groupId
    ? await sql`
        SELECT e.user_id, u.display_name, e.game_id, e.variant, e.puzzle_date::text AS puzzle_date,
               e.parsed_value, e.solved, g.metric_direction
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL AND g.active = true
          AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
          AND e.puzzle_date <= ${today}::date
          AND e.user_id IN (SELECT user_id FROM memberships WHERE group_id = ${groupId})
          AND e.game_id IN (
            SELECT gg.game_id FROM group_games gg
            JOIN games ga ON ga.id = gg.game_id AND ga.active = true
            WHERE gg.group_id = ${groupId}
          )
      `
    : await sql`
        SELECT e.user_id, u.display_name, e.game_id, e.variant, e.puzzle_date::text AS puzzle_date,
               e.parsed_value, e.solved, g.metric_direction
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL AND g.active = true
          AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
          AND e.puzzle_date <= ${today}::date
      `) as {
    user_id: string;
    display_name: string;
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  const names = new Map(rows.map((r) => [r.user_id, r.display_name]));
  const gameEntries: GameEntry[] = rows.map((r) => ({
    playerId: r.user_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = computeOverallMedals(gameEntries).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    gold: s.gold,
    silver: s.silver,
    bronze: s.bronze,
    gamesPlayed: s.gamesPlayed,
    gamesLed: s.gamesLed, // gameIds; the client maps ids→names via its games catalog
  }));
  return NextResponse.json({ window, locked: false, players, viewerName: guard.viewer.displayName ?? null });
}
```

Notes on what changed vs. the old file (all in this one replacement):
- Deleted the whole `if (window === "daily") { … dedicated played-today query … }` block, the `let visibleRows`/`let locked` declarations, and the no-peek comment paragraph.
- Deleted the now-unused `const viewerUserId = guard.viewer.userId;` line and its comment (it existed only for the no-peek query).
- `names`/`gameEntries` are now built from `rows` (was `visibleRows`).
- The response returns `locked: false` literally (was the computed `locked`).
- The header docstring's no-peek sentence is replaced with the M007 paragraph.
- The two SQL template literals are byte-for-byte unchanged from the old file — do not alter them (tests assert their text).

- [ ] **Step 4: Run the leaderboard tests to confirm they PASS.**

Run: `npx vitest run src/app/api/leaderboard/leaderboard.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Typecheck, full test suite, and build.**

Run: `npx tsc --noEmit`
Expected: 0 errors (in particular, no "declared but never read" for `viewerUserId` — it must be gone).

Run: `npx vitest run`
Expected: all tests pass (the whole suite; nothing else references this route's no-peek behavior).

Run: `npm run build`
Expected: build completes; `/api/leaderboard` still listed as a route.

- [ ] **Step 6: Commit.**

```bash
git add "src/app/api/leaderboard/route.ts" "src/app/api/leaderboard/leaderboard.test.ts"
git commit -m "feat(leaderboard): overall board shows honest participation (M007)"
```

---

## Deploy (gated — owner go-ahead)

Code-only, no migration. Standard gated sequence: backup tag on `origin/main` → PR → CI `verify` → **owner approves** → squash-merge → prod health check (home 200, `/api/me` 401 signed-out, `/standings` reachable). Owner verifies on the live Board: **Overall + Today** now shows every player's true games-played count and today's medals, and is not locked before they've played.

## Self-Review

- **Spec coverage:**
  - "Remove the daily no-peek block (query + filter + locked)" → Task 1 Step 3 (block deleted; `locked: false`). ✓
  - "Applies to default and `?group=` paths" → the block was after the shared `rows` binding; both paths covered; test "a group-scoped daily board shows members honestly…" proves it. ✓
  - "Update the now-false header docstring + inline comments" → Step 3 replaces the docstring paragraph and removes the inline no-peek comments and the `viewerUserId` comment. ✓
  - "Response shape unchanged; `locked` always false" → response literal `{ window, locked: false, players, viewerName }`; test "returns the leaderboard shape" asserts it. ✓
  - Test plan: remove `locked:true` assertions ✓ (old tests replaced); remove dead played-today mock steps ✓ (each rewritten test mocks exactly one `sql` call + asserts `toHaveBeenCalledTimes(1)` on daily); DELETE OUTRIGHT the "unlocks a group-scoped daily leaderboard…" test ✓ (absent from the new file); rewrite "today's Overall reflects only today's per-game winners" to expect ALL players ✓ ("…reflects ALL today's per-game winners"); add daily-always-`locked:false` ✓, per-player `gamesPlayed` uncapped ✓ ("each player's gamesPlayed reflects their OWN games…"), tally reflects all winners ✓, viewer-played-nothing still returns all players ✓; keep aggregate-window + group-scoping + 401/403 green ✓ (all retained).
  - "Do not touch per-game board / medals.ts / noPeek.ts / UI" → Global Constraints; Task 1 modifies only the two files. ✓
- **Placeholder scan:** none — both files given in full; commands concrete with expected output.
- **Type consistency:** `computeOverallMedals` returns `gamesLed: string[]`, `gamesPlayed: number`, medal counts — matches the mapped `players` shape and the test expectations; `GameEntry` fields (`playerId, gameId, variant, puzzleKey, value, solved, direction`) match `@/scoring/wins`; response keys match `MeResponse`-adjacent client reads (`locked`, `players`, `viewerName`) already consumed by `standings/page.tsx`.
