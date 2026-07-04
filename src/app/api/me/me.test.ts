import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

function req(): Request {
  return new Request("http://localhost/api/me");
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

  it("always queries entries for an authenticated user (no player-less short-circuit)", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    // Exactly two queries: games + entries. No groups lookup, no skip.
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
