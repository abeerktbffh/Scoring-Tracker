import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const requireGroupAdminMock = vi.fn();
const leaveGroupMock = vi.fn();

vi.mock("@/lib/membership", () => ({
  requireMember: requireMemberMock,
  requireGroupAdmin: requireGroupAdminMock,
}));
vi.mock("@/lib/groups", () => ({ leaveGroup: leaveGroupMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { POST } = await import("./route");

const MEMBER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Member User",
    isSuperAdmin: false,
  },
};

function postRequest(): Request {
  return new Request("http://localhost/api/groups/grp_1/leave", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/groups/[groupId]/leave", () => {
  it("403s when the guard fails, never touching leaveGroup", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await POST(postRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(403);
    expect(leaveGroupMock).not.toHaveBeenCalled();
  });

  it("uses requireMember (not requireGroupAdmin) so any member — not just an admin — can leave", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    leaveGroupMock.mockResolvedValue({ ok: true });

    const res = await POST(postRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(requireMemberMock).toHaveBeenCalledWith("grp_1");
    expect(requireGroupAdminMock).not.toHaveBeenCalled();
    expect(leaveGroupMock).toHaveBeenCalledWith("u1", "grp_1");
  });
});
