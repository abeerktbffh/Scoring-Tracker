import { describe, it, expect, vi, beforeEach } from "vitest";

const requireGroupAdminMock = vi.fn();
const removeMemberMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireGroupAdmin: requireGroupAdminMock }));
vi.mock("@/lib/groups", () => ({ removeMember: removeMemberMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { DELETE } = await import("./route");

const ADMIN_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Admin User",
    isSuperAdmin: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/groups/[groupId]/members/[userId]", () => {
  it("403s when the guard fails, never touching removeMember", async () => {
    requireGroupAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await DELETE(new Request("http://localhost/api/groups/grp_1/members/u2", { method: "DELETE" }), {
      params: { groupId: "grp_1", userId: "u2" },
    });
    expect(res.status).toBe(403);
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("200s with ok on success, removing the target user (not the viewer)", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    removeMemberMock.mockResolvedValue({ ok: true });

    const res = await DELETE(new Request("http://localhost/api/groups/grp_1/members/u2", { method: "DELETE" }), {
      params: { groupId: "grp_1", userId: "u2" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(requireGroupAdminMock).toHaveBeenCalledWith("grp_1");
    expect(removeMemberMock).toHaveBeenCalledWith("grp_1", "u2");
  });
});
