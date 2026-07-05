import { describe, it, expect, vi, beforeEach } from "vitest";

const requireGroupAdminMock = vi.fn();
const setGroupGamesMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireGroupAdmin: requireGroupAdminMock }));
vi.mock("@/lib/groups", () => ({ setGroupGames: setGroupGamesMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { PUT } = await import("./route");

const ADMIN_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Admin User",
    isSuperAdmin: false,
  },
};

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/groups/grp_1/games", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/groups/[groupId]/games", () => {
  it("403s when the guard fails, never touching setGroupGames", async () => {
    requireGroupAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await PUT(putRequest({ gameIds: ["g_wordle"] }), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(403);
    expect(setGroupGamesMock).not.toHaveBeenCalled();
  });

  it("200s with ok on success", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    setGroupGamesMock.mockResolvedValue({ ok: true });

    const res = await PUT(putRequest({ gameIds: ["g_wordle", "g_connections"] }), {
      params: { groupId: "grp_1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(requireGroupAdminMock).toHaveBeenCalledWith("grp_1");
    expect(setGroupGamesMock).toHaveBeenCalledWith("grp_1", ["g_wordle", "g_connections"]);
  });

  it("treats a missing/invalid gameIds body as an empty list", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    setGroupGamesMock.mockResolvedValue({ ok: true });

    const res = await PUT(putRequest({}), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(200);
    expect(setGroupGamesMock).toHaveBeenCalledWith("grp_1", []);
  });
});
