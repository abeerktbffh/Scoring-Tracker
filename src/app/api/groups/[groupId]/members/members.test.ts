import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const listGroupMembersMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireMember: requireMemberMock }));
vi.mock("@/lib/groups", () => ({ listGroupMembers: listGroupMembersMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

const MEMBER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Member User",
    isSuperAdmin: false,
  },
};

function getRequest(): Request {
  return new Request("http://localhost/api/groups/grp_1/members", { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/groups/[groupId]/members", () => {
  it("403s when the guard fails, never touching listGroupMembers", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(getRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(403);
    expect(listGroupMembersMock).not.toHaveBeenCalled();
  });

  it("200s with the member list for a member", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    listGroupMembersMock.mockResolvedValue([
      { userId: "u1", displayName: "Ada", role: "admin" },
      { userId: "u2", displayName: "Bea", role: "member" },
    ]);

    const res = await GET(getRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      members: [
        { userId: "u1", displayName: "Ada", role: "admin" },
        { userId: "u2", displayName: "Bea", role: "member" },
      ],
    });
    expect(requireMemberMock).toHaveBeenCalledWith("grp_1");
    expect(listGroupMembersMock).toHaveBeenCalledWith("grp_1");
  });
});
