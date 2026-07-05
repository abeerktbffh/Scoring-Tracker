import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

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

describe("GET /api/players", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns all named users, keyed by displayName", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    sqlMock.mockResolvedValueOnce([{ id: "u1", display_name: "Session User" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ players: [{ id: "u1", displayName: "Session User" }] });

    const queryText = sqlMock.mock.calls[0][0].join("");
    expect(queryText).toMatch(/FROM users/);
    expect(queryText).toMatch(/display_name IS NOT NULL/);
    expect(queryText).not.toMatch(/group_id/);
  });
});
