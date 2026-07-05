import { describe, it, expect, vi, beforeEach } from "vitest";

const requireGroupAdminMock = vi.fn();
const renameGroupMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireGroupAdmin: requireGroupAdminMock }));
vi.mock("@/lib/groups", () => ({ renameGroup: renameGroupMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { PATCH, DELETE } = await import("./route");

const ADMIN_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Admin User",
    isSuperAdmin: false,
  },
};

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/groups/grp_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/groups/[groupId]", () => {
  it("403s when the guard fails, never touching renameGroup", async () => {
    requireGroupAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await PATCH(patchRequest({ name: "New Name" }), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(403);
    expect(renameGroupMock).not.toHaveBeenCalled();
  });

  it("400s when renameGroup reports an invalid name", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    renameGroupMock.mockResolvedValue({ ok: false, reason: "invalid-name" });

    const res = await PATCH(patchRequest({ name: "" }), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(400);
  });

  it("200s with ok on success", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    renameGroupMock.mockResolvedValue({ ok: true });

    const res = await PATCH(patchRequest({ name: "New Name" }), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(requireGroupAdminMock).toHaveBeenCalledWith("grp_1");
    expect(renameGroupMock).toHaveBeenCalledWith("grp_1", "New Name");
  });
});

describe("DELETE /api/groups/[groupId]", () => {
  it("403s when the guard fails, never touching the DB", async () => {
    requireGroupAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await DELETE(new Request("http://localhost/api/groups/grp_1", { method: "DELETE" }), {
      params: { groupId: "grp_1" },
    });
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("uses requireGroupAdmin (not just requireUser) and deletes the group on success", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    sqlMock.mockResolvedValue([]);

    const res = await DELETE(new Request("http://localhost/api/groups/grp_1", { method: "DELETE" }), {
      params: { groupId: "grp_1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(requireGroupAdminMock).toHaveBeenCalledWith("grp_1");
    expect(sqlMock).toHaveBeenCalled();
    const queryText = sqlMock.mock.calls[0][0].join(" ");
    expect(queryText).toMatch(/DELETE FROM groups/);
  });
});
