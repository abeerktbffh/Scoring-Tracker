import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireMember: requireMemberMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

function req(url = "http://localhost/api/leaderboard"): Request {
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

describe("GET /api/leaderboard", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s an authenticated non-member, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the leaderboard shape for a session member", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([
        {
          player_id: "p_session",
          display_name: "Session Player",
          game_id: "g_wordle",
          variant: null,
          puzzle_date: "2026-07-01",
          parsed_value: 4,
          solved: true,
          metric_direction: "lower_better",
        },
      ]); // entries

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      window: "daily",
      locked: false,
      players: [{ displayName: "Session Player", wins: 1, gamesPlayed: 1, winRate: 1 }],
    });
  });
});
