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

function req(url = "http://localhost/api/me"): Request {
  return new Request(url);
}

const USER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Session User",
    isSuperAdmin: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/me", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the me shape for a session user with no entries yet", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock
      .mockResolvedValueOnce([{ id: "g_wordle", name: "Wordle" }]) // active games
      .mockResolvedValueOnce([]); // entries for the user

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today.totalCount).toBe(1);
    expect(body.today.loggedCount).toBe(0);
    expect(body.today.games).toEqual([{ gameId: "g_wordle", name: "Wordle", logged: false }]);
    expect(body.recent).toEqual([]);
    expect(body.displayName).toBe("Session User");

    // Games query drops the group filter — global catalog, active games only.
    const gamesQueryStrings: string[] = sqlMock.mock.calls[0][0];
    expect(gamesQueryStrings.join("")).toContain("WHERE active = true");
    expect(gamesQueryStrings.join("")).not.toContain("group_id");

    // Entries query keys on the viewer's user_id, not a player/group.
    const entriesQueryStrings: string[] = sqlMock.mock.calls[1][0];
    const entriesQueryValues: unknown[] = sqlMock.mock.calls[1].slice(1);
    expect(entriesQueryStrings.join("")).toContain("e.user_id");
    expect(entriesQueryStrings.join("")).not.toContain("group_id");
    expect(entriesQueryStrings.join("")).not.toContain("player_id");
    expect(entriesQueryValues).toContain("u1");
  });

  it("returns displayName: null when the session viewer has no display name yet", async () => {
    requireUserMock.mockResolvedValue({
      ok: true,
      viewer: { userId: "u1", displayName: null, isSuperAdmin: false },
    });
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.displayName).toBeNull();
  });

  it("always queries entries for an authenticated user (no player-less short-circuit)", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    // Exactly two queries: games + entries. No groups lookup, no skip.
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("uses requireUser and the global queries when ?group= is absent", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await GET(req());
    expect(requireUserMock).toHaveBeenCalled();
    expect(requireMemberMock).not.toHaveBeenCalled();
  });

  it("excludes entries for inactive games from the global (ungrouped) You list", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await GET(req());
    const entriesCall = sqlMock.mock.calls[1];
    const entriesQueryText = entriesCall[0].join(" ").replace(/\s+/g, " ");
    expect(entriesQueryText).toContain("g.active = true");
  });

  it("403s a non-member requesting ?group=g1, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(req("http://localhost/api/me?group=g1"));
    expect(res.status).toBe(403);
    expect(requireMemberMock).toHaveBeenCalledWith("g1");
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("scopes both queries to the group and tracked-active games for a member", async () => {
    requireMemberMock.mockResolvedValue(USER_VIEWER);
    sqlMock
      .mockResolvedValueOnce([{ id: "g_wordle", name: "Wordle" }])
      .mockResolvedValueOnce([]);

    const res = await GET(req("http://localhost/api/me?group=g1"));
    expect(res.status).toBe(200);
    expect(requireMemberMock).toHaveBeenCalledWith("g1");

    const gamesCall = sqlMock.mock.calls[0];
    const gamesQueryText = gamesCall[0].join(" ").replace(/\s+/g, " ");
    expect(gamesQueryText).toMatch(
      /AND id IN \( SELECT gg\.game_id FROM group_games gg JOIN games ga ON ga\.id = gg\.game_id AND ga\.active = true WHERE gg\.group_id = /,
    );
    expect(gamesCall.slice(1)).toContain("g1");

    const entriesCall = sqlMock.mock.calls[1];
    const entriesQueryText = entriesCall[0].join(" ").replace(/\s+/g, " ");
    expect(entriesQueryText).toMatch(
      /AND e\.user_id IN \(SELECT user_id FROM memberships WHERE group_id = /,
    );
    expect(entriesQueryText).toMatch(
      /AND e\.game_id IN \( SELECT gg\.game_id FROM group_games gg JOIN games ga ON ga\.id = gg\.game_id AND ga\.active = true WHERE gg\.group_id = /,
    );
    expect(entriesCall.slice(1)).toContain("g1");
  });
});
