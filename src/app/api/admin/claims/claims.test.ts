import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const listPendingClaimsMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/claims", () => ({ listPendingClaims: listPendingClaimsMock }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/claims", () => {
  it("401s when unauthenticated, never reaching listPendingClaims", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(listPendingClaimsMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin member, never reaching listPendingClaims", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(listPendingClaimsMock).not.toHaveBeenCalled();
  });

  it("returns pending claims for an admin", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      viewer: { userId: "admin1", player: { id: "p1", displayName: "Admin" }, isAdmin: true },
    });
    listPendingClaimsMock.mockResolvedValue([
      {
        id: "claim1",
        playerId: "p2",
        playerDisplayName: "Legacy",
        claimedByUserId: "u2",
        claimedByEmail: "u2@example.com",
        claimedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims).toHaveLength(1);
    expect(listPendingClaimsMock).toHaveBeenCalledWith("g1");
  });
});
