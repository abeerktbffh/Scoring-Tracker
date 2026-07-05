import { describe, it, expect, vi, beforeEach } from "vitest";
import { localDateInTz } from "@/lib/day";
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
    expect(body).toEqual({ gameId: "g_wordle", window: "daily", locked: true, players: [] });
  });

  it("returns the board shape for a user who has played today", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        user_id: "u_session",
        display_name: "Session Player",
        variant: null,
        puzzle_date: TODAY,
        parsed_value: 4,
        solved: true,
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
      locked: false,
      players: [
        {
          displayName: "Session Player",
          wins: 1,
          gamesPlayed: 1,
          bestValue: 4,
          currentStreak: 1,
          longestStreak: 1,
        },
      ],
    });

    // Query joins `users` (not `players`) and has no group_id filter.
    const queryText = sqlMock.mock.calls[0][0].join(" ");
    expect(queryText).toMatch(/JOIN users u ON u\.id = e\.user_id/);
    expect(queryText).not.toMatch(/players/i);
    expect(queryText).not.toMatch(/group_id/i);
    expect(queryText).toMatch(/u\.display_name IS NOT NULL/);
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
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query: viewer played nothing

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    const body = await res.json();
    // Viewer (u_session) hasn't played today, so the board is locked.
    expect(body).toEqual({ gameId: "g_wordle", window: "daily", locked: true, players: [] });
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
        metric_direction: "lower_better",
      },
    ]);
    sqlMock.mockResolvedValueOnce([]); // dedicated played-today query: viewer played nothing

    const res = await GET(req("http://localhost/api/games/g_wordle/board?group=g1"), {
      params: { gameId: "g_wordle" },
    });
    const body = await res.json();
    expect(body).toEqual({ gameId: "g_wordle", window: "daily", locked: true, players: [] });
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
    expect(body).toEqual({ gameId: "g_wordle", window: "daily", locked: true, players: [] });
  });
});
