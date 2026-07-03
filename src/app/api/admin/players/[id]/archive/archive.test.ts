import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const archivePlayerMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/claims", () => ({ archivePlayer: archivePlayerMock }));

const { POST } = await import("./route");

function request(): Request {
  return new Request("http://localhost/api/admin/players/p1/archive", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/players/[id]/archive", () => {
  it("401s when unauthenticated, never reaching archivePlayer", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(request(), { params: { id: "p1" } });
    expect(res.status).toBe(401);
    expect(archivePlayerMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin member, never reaching archivePlayer", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(request(), { params: { id: "p1" } });
    expect(res.status).toBe(403);
    expect(archivePlayerMock).not.toHaveBeenCalled();
  });

  it("archives the player for an admin", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      viewer: { userId: "admin1", player: { id: "pAdmin", displayName: "Admin" }, isAdmin: true },
    });
    archivePlayerMock.mockResolvedValue(undefined);

    const res = await POST(request(), { params: { id: "p1" } });
    expect(res.status).toBe(200);
    expect(archivePlayerMock).toHaveBeenCalledWith("p1", "admin1");
  });
});
