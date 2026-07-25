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
