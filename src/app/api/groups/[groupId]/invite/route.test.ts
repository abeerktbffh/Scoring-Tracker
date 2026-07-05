import { describe, it, expect, vi, beforeEach } from "vitest";

const requireGroupAdminMock = vi.fn();
const resetInviteMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireGroupAdmin: requireGroupAdminMock }));
vi.mock("@/lib/groups", () => ({ resetInvite: resetInviteMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { POST } = await import("./route");

const ADMIN_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Admin User",
    isSuperAdmin: false,
  },
};

function postRequest(): Request {
  return new Request("http://localhost/api/groups/grp_1/invite", { method: "POST" });
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
