import { describe, it, expect, vi, beforeEach } from "vitest";

const requireGroupAdminMock = vi.fn();
const requireMemberMock = vi.fn();
const resetInviteMock = vi.fn();
const getGroupInviteMock = vi.fn();

vi.mock("@/lib/membership", () => ({
  requireGroupAdmin: requireGroupAdminMock,
  requireMember: requireMemberMock,
}));
vi.mock("@/lib/groups", () => ({ resetInvite: resetInviteMock, getGroupInvite: getGroupInviteMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { POST, GET } = await import("./route");

const ADMIN_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Admin User",
    isSuperAdmin: false,
  },
};

const MEMBER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u2",
    displayName: "Member User",
    isSuperAdmin: false,
  },
};

function postRequest(): Request {
  return new Request("http://localhost/api/groups/grp_1/invite", { method: "POST" });
}

function getRequest(): Request {
  return new Request("http://localhost/api/groups/grp_1/invite", { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/groups/[groupId]/invite", () => {
  it("403s when the guard fails, never touching resetInvite", async () => {
    requireGroupAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(postRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(403);
    expect(resetInviteMock).not.toHaveBeenCalled();
  });

  it("200s with a link containing the reset token", async () => {
    requireGroupAdminMock.mockResolvedValue(ADMIN_VIEWER);
    resetInviteMock.mockResolvedValue({ token: "tok_fresh123" });

    const res = await POST(postRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(requireGroupAdminMock).toHaveBeenCalledWith("grp_1");
    expect(resetInviteMock).toHaveBeenCalledWith("grp_1");
    expect(body.link).toContain("tok_fresh123");
    expect(body.link).toBe("http://localhost/?join=tok_fresh123");
  });
});

describe("GET /api/groups/[groupId]/invite", () => {
  it("403s when the guard fails, never touching getGroupInvite", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await GET(getRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(403);
    expect(getGroupInviteMock).not.toHaveBeenCalled();
  });

  it("200s with the current invite link for a member", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    getGroupInviteMock.mockResolvedValue({ token: "tok_current456" });

    const res = await GET(getRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(requireMemberMock).toHaveBeenCalledWith("grp_1");
    expect(getGroupInviteMock).toHaveBeenCalledWith("grp_1");
    expect(body.link).toBe("http://localhost/?join=tok_current456");
  });

  it("404s when the group has no invite token", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    getGroupInviteMock.mockResolvedValue(null);

    const res = await GET(getRequest(), { params: { groupId: "grp_1" } });
    expect(res.status).toBe(404);
  });
});
