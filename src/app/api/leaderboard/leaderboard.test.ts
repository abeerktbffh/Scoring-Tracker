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
    ]); // entries (no groups lookup anymore)

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      window: "daily",
      locked: false,
      players: [{ displayName: "Session Player", wins: 1, gamesPlayed: 1, winRate: 1 }],
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
    // Viewer (u_session) hasn't played today, so the board is locked and
    // other users' entries are hidden despite existing in the row set.
    expect(body.locked).toBe(true);
    expect(body.players).toEqual([]);
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

  it("no-peek still keys on the viewer's global userId when scoped to a group", async () => {
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
    // Viewer (u_session) hasn't played today, so still locked even though the
    // row set is (in principle) group-scoped — no-peek is unaffected by group.
    expect(body.locked).toBe(true);
    expect(body.players).toEqual([]);
  });
});
