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

function req(url = "http://localhost/api/games"): Request {
  return new Request(url);
}

const AUTHED_VIEWER = {
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

describe("GET /api/games", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the games shape for an authenticated user, with no group filter", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        id: "g_wordle",
        name: "Wordle",
        type: "numeric",
        metric_direction: "lower_better",
        has_variants: false,
      },
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      games: [
        {
          id: "g_wordle",
          name: "Wordle",
          type: "numeric",
          metricDirection: "lower_better",
          hasVariants: false,
        },
      ],
    });

    const queryText = sqlMock.mock.calls[0][0].join("");
    expect(queryText).not.toMatch(/group_id/);
    expect(queryText).toMatch(/active = true/);
  });

  it("uses requireUser and the global query when ?group= is absent", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    sqlMock.mockResolvedValueOnce([]);

    await GET(req());
    expect(requireUserMock).toHaveBeenCalled();
    expect(requireMemberMock).not.toHaveBeenCalled();
  });

  it("403s a non-member requesting ?group=g1, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(req("http://localhost/api/games?group=g1"));
    expect(res.status).toBe(403);
    expect(requireMemberMock).toHaveBeenCalledWith("g1");
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("joins group_games for a member's ?group=g1 request", async () => {
    requireMemberMock.mockResolvedValue(AUTHED_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        id: "g_wordle",
        name: "Wordle",
        type: "numeric",
        metric_direction: "lower_better",
        has_variants: false,
      },
    ]);

    const res = await GET(req("http://localhost/api/games?group=g1"));
    expect(res.status).toBe(200);
    expect(requireMemberMock).toHaveBeenCalledWith("g1");

    const call = sqlMock.mock.calls[0];
    const queryText = call[0].join(" ");
    expect(queryText).toMatch(
      /JOIN group_games gg ON gg\.game_id = g\.id AND gg\.group_id = /,
    );
    expect(queryText).toMatch(/WHERE g\.active = true/);
    expect(queryText).toMatch(/ORDER BY g\.name/);
    expect(call.slice(1)).toContain("g1");
  });
});
