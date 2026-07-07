import { describe, it, expect, vi, beforeEach } from "vitest";
import { localDateInTz } from "@/lib/day";
import { toDayNumber, fromDayNumber } from "@/lib/day";
import { PLATFORM_TZ } from "@/lib/group";

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

const TODAY = localDateInTz(PLATFORM_TZ);
// Well outside any weekly/monthly window, so it exercises "full-history" PB.
const OLD_DATE = fromDayNumber(toDayNumber(TODAY) - 400);

function req(url = "http://localhost/api/games/g_wordle/board"): Request {
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

describe("GET /api/games/[gameId]/board", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("locks the daily board for a user who hasn't played today", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]); // no entries at all (no groups lookup anymore)
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query: no play

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      gameId: "g_wordle",
      window: "daily",
      mode: "daily",
      locked: true,
      players: [],
      viewerName: "Session Player",
    });
  });

  it("returns the daily live-contest shape for a user who has played today", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([{}]); // dedicated played-today query: viewer played

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      gameId: "g_wordle",
      window: "daily",
      mode: "daily",
      locked: false,
      players: [
        {
          displayName: "Session Player",
          value: 4,
          valueFormatted: "0:04",
          solved: true,
          medal: "gold",
          detail: null,
          variant: null,
        },
      ],
      viewerName: "Session Player",
    });

    // Query joins `users` (not `players`) and has no group_id filter.
    const queryText = sqlMock.mock.calls[0][0].join(" ");
    expect(queryText).toMatch(/JOIN users u ON u\.id = e\.user_id/);
    expect(queryText).not.toMatch(/players/i);
    expect(queryText).not.toMatch(/group_id/i);
    expect(queryText).toMatch(/u\.display_name IS NOT NULL/);
    expect(queryText).toMatch(/e\.detail/);
  });

  it("threads structured detail through to the daily contest row", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    const detail = { guesses: 4, hardMode: true };
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
        detail,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([{}]);

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    const body = await res.json();
    expect(body.players[0].detail).toEqual(detail);
  });

  it("Pips today: ranks each difficulty as its own sub-contest and keeps a player's two same-day rows from colliding on detail", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    const easyDetail = { seconds: 120, backtracks: 0 };
    const hardDetail = { seconds: 300, backtracks: 2 };
    sqlMock.mockResolvedValueOnce([
      // u_session logs BOTH difficulties today — this is the collision case:
      // detailById must be keyed by variant too, or one overwrites the other.
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: "easy",
        puzzle_date: TODAY,
        parsed_value: 120,
        solved: true,
        detail: easyDetail,
        metric_direction: "lower_better",
      },
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: "hard",
        puzzle_date: TODAY,
        parsed_value: 300,
        solved: true,
        detail: hardDetail,
        metric_direction: "lower_better",
      },
      // u_other only plays hard, and is slower — but numerically their value
      // (400s) would still lose to easy's 120s in a merged ranking; per-group
      // ranking must still give them silver within the hard group, not be
      // pushed out of medals entirely by the easy group's faster time.
      {
        user_id: "u_other",
        display_name: "Other Player",
        variant: "hard",
        puzzle_date: TODAY,
        parsed_value: 400,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([{}]); // viewer played today

    const res = await GET(req("http://localhost/api/games/g_pips/board"), {
      params: { gameId: "g_pips" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("daily");
    expect(body.locked).toBe(false);

    const byVariantAndName = Object.fromEntries(
      body.players.map((p: { variant: string | null; displayName: string }) => [`${p.variant}|${p.displayName}`, p]),
    );

    // Each difficulty group medals independently.
    const easyRow = byVariantAndName["easy|Session Player"];
    const hardSessionRow = byVariantAndName["hard|Session Player"];
    const hardOtherRow = byVariantAndName["hard|Other Player"];
    expect(easyRow).toMatchObject({ variant: "easy", medal: "gold", valueFormatted: "2:00", detail: easyDetail });
    expect(hardSessionRow).toMatchObject({ variant: "hard", medal: "gold", valueFormatted: "5:00", detail: hardDetail });
    expect(hardOtherRow).toMatchObject({ variant: "hard", medal: "silver", valueFormatted: "6:40", detail: null });

    // The Session Player's two rows carry their OWN variant-specific detail —
    // no cross-variant leakage from the user_id|puzzle_date collision.
    expect(easyRow.detail).toEqual(easyDetail);
    expect(hardSessionRow.detail).toEqual(hardDetail);
    expect(easyRow.detail).not.toEqual(hardSessionRow.detail);

    // Output is grouped: easy rows before hard rows.
    expect(body.players.map((p: { variant: string | null }) => p.variant)).toEqual(["easy", "hard", "hard"]);
  });

  it("no-peek keys on the viewer's userId, not any player id", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_other",
        display_name: "Other User",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query: viewer played nothing

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    const body = await res.json();
    // Viewer (u_session) hasn't played today, so the board is locked.
    expect(body).toEqual({
      gameId: "g_wordle",
      window: "daily",
      mode: "daily",
      locked: true,
      players: [],
      viewerName: "Session Player",
    });
  });

  it("uses requireUser and the global query when ?group= is absent", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query

    await GET(req(), { params: { gameId: "g_wordle" } });
    expect(requireUserMock).toHaveBeenCalled();
    expect(requireMemberMock).not.toHaveBeenCalled();
  });

  it("403s a non-member requesting ?group=g1, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(req("http://localhost/api/games/g_wordle/board?group=g1"), {
      params: { gameId: "g_wordle" },
    });
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
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([{}]); // dedicated played-today query: viewer played

    const res = await GET(req("http://localhost/api/games/g_wordle/board?group=g1"), {
      params: { gameId: "g_wordle" },
    });
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

  it("no-peek still keys on the viewer's global userId when scoped to a group", async () => {
    requireMemberMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_other",
        display_name: "Other User",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query: viewer played nothing

    const res = await GET(req("http://localhost/api/games/g_wordle/board?group=g1"), {
      params: { gameId: "g_wordle" },
    });
    const body = await res.json();
    expect(body).toEqual({
      gameId: "g_wordle",
      window: "daily",
      mode: "daily",
      locked: true,
      players: [],
      viewerName: "Session Player",
    });
  });

  it("unlocks a group-scoped board via the dedicated played-today query even when group-filtered rows contain none of the viewer's plays", async () => {
    requireMemberMock.mockResolvedValue(USER_VIEWER);
    // The group-filtered `rows` query is empty (e.g. the group doesn't track
    // this game) — if `playedToday` were (incorrectly) derived from `rows`,
    // the viewer would be wrongly locked.
    sqlMock.mockResolvedValueOnce([]);
    // The dedicated played-today query is keyed only on the viewer's own
    // user_id/gameId/date, independent of the group filter, and finds a play.
    sqlMock.mockResolvedValueOnce([{}]);

    const res = await GET(req("http://localhost/api/games/g_wordle/board?group=g1"), {
      params: { gameId: "g_wordle" },
    });
    const body = await res.json();
    expect(body.locked).toBe(false);
    expect(body.players).toEqual([]);
  });

  it("keeps a group-scoped board locked when the dedicated played-today query finds no global play", async () => {
    requireMemberMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query: no global play

    const res = await GET(req("http://localhost/api/games/g_wordle/board?group=g1"), {
      params: { gameId: "g_wordle" },
    });
    const body = await res.json();
    expect(body).toEqual({
      gameId: "g_wordle",
      window: "daily",
      mode: "daily",
      locked: true,
      players: [],
      viewerName: "Session Player",
    });
  });
});

describe("GET /api/games/[gameId]/board — aggregate windows (weekly/monthly/all)", () => {
  it("returns a medal-tally board, never gated by no-peek", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
      {
        user_id: "u_other",
        display_name: "Other Player",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 5,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    // Viewer has NOT played today — an aggregate window must not lock on that.
    sqlMock.mockResolvedValueOnce([]);

    const res = await GET(req("http://localhost/api/games/g_wordle/board?window=weekly"), {
      params: { gameId: "g_wordle" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("aggregate");
    expect(body.locked).toBe(false);
    expect(body.players).toEqual([
      { displayName: "Session Player", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1 },
      { displayName: "Other Player", gold: 0, silver: 1, bronze: 0, gamesPlayed: 1 },
    ]);
  });

  it("gamesPlayed is window-scoped even when older out-of-window entries exist", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      // In-window entry: this week's result.
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 10,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
      // Out-of-window entry (400 days ago): must not count toward gamesPlayed.
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: OLD_DATE,
        parsed_value: 2,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([]);

    const res = await GET(req("http://localhost/api/games/g_wordle/board?window=weekly"), {
      params: { gameId: "g_wordle" },
    });
    const body = await res.json();
    expect(body.mode).toBe("aggregate");
    // gamesPlayed is window-scoped: only the in-window entry counts.
    expect(body.players).toEqual([
      { displayName: "Session Player", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1 },
    ]);
  });

  it("returns all-time (window=all) as an unwindowed medal tally", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: OLD_DATE,
        parsed_value: 3,
        solved: true,
        detail: null,
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([]);

    const res = await GET(req("http://localhost/api/games/g_wordle/board?window=all"), {
      params: { gameId: "g_wordle" },
    });
    const body = await res.json();
    expect(body.mode).toBe("aggregate");
    expect(body.locked).toBe(false);
    expect(body.players).toEqual([
      { displayName: "Session Player", gold: 1, silver: 0, bronze: 0, gamesPlayed: 1 },
    ]);
  });
});
