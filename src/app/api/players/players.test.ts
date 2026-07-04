import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireMember: requireMemberMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

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

describe("GET /api/players", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s an authenticated non-member, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the players shape for a session member", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    sqlMock.mockResolvedValueOnce([{ id: "p_session", display_name: "Session Player" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ players: [{ id: "p_session", displayName: "Session Player" }] });
  });
});
