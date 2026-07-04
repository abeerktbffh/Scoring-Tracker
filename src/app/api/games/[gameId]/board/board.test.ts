import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireMember: requireMemberMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

function req(url = "http://localhost/api/games/g_wordle/board"): Request {
  return new Request(url);
}

const MEMBER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    player: { id: "p_session", displayName: "Session Player" },
    isAdmin: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/games/[gameId]/board", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s an authenticated non-member, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("locks the daily board for a member who hasn't played today", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([]); // no entries at all

    const res = await GET(req(), { params: { gameId: "g_wordle" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ gameId: "g_wordle", window: "daily", locked: true, players: [] });
  });
});
