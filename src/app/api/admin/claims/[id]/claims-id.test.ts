import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const approveClaimMock = vi.fn();
const rejectClaimMock = vi.fn();
const sendAdminJoinNotificationMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/claims", () => ({
  approveClaim: approveClaimMock,
  rejectClaim: rejectClaimMock,
}));
vi.mock("@/lib/email", () => ({ sendAdminJoinNotification: sendAdminJoinNotificationMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/claims/claim1", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ADMIN_VIEWER = { userId: "admin1", player: { id: "p1", displayName: "Admin" }, isAdmin: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/claims/[id]", () => {
  it("401s when unauthenticated, never reaching approve/reject", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ decision: "approve" }), { params: { id: "claim1" } });
    expect(res.status).toBe(401);
    expect(approveClaimMock).not.toHaveBeenCalled();
    expect(rejectClaimMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin member, never reaching approve/reject", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(jsonRequest({ decision: "reject" }), { params: { id: "claim1" } });
    expect(res.status).toBe(403);
    expect(approveClaimMock).not.toHaveBeenCalled();
    expect(rejectClaimMock).not.toHaveBeenCalled();
  });

  it("400s an invalid decision", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, viewer: ADMIN_VIEWER });

    const res = await POST(jsonRequest({ decision: "maybe" }), { params: { id: "claim1" } });
    expect(res.status).toBe(400);
    expect(approveClaimMock).not.toHaveBeenCalled();
    expect(rejectClaimMock).not.toHaveBeenCalled();
  });

  it("approves and sends the admin join notification on success", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, viewer: ADMIN_VIEWER });
    approveClaimMock.mockResolvedValue({ ok: true, playerName: "Legacy", userEmail: "u2@example.com" });

    const res = await POST(jsonRequest({ decision: "approve" }), { params: { id: "claim1" } });
    expect(res.status).toBe(200);
    expect(approveClaimMock).toHaveBeenCalledWith("claim1", "admin1");
    expect(sendAdminJoinNotificationMock).toHaveBeenCalledWith("Legacy", "u2@example.com");
  });

  it("approves without notifying when there is no user email", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, viewer: ADMIN_VIEWER });
    approveClaimMock.mockResolvedValue({ ok: true, playerName: "Legacy", userEmail: null });

    const res = await POST(jsonRequest({ decision: "approve" }), { params: { id: "claim1" } });
    expect(res.status).toBe(200);
    expect(sendAdminJoinNotificationMock).not.toHaveBeenCalled();
  });

  it("maps approve not-found to 404", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, viewer: ADMIN_VIEWER });
    approveClaimMock.mockResolvedValue({ ok: false, reason: "not-found" });

    const res = await POST(jsonRequest({ decision: "approve" }), { params: { id: "claim1" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not-found");
    expect(sendAdminJoinNotificationMock).not.toHaveBeenCalled();
  });

  it("maps approve already-resolved/already-member to 409", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, viewer: ADMIN_VIEWER });
    approveClaimMock.mockResolvedValue({ ok: false, reason: "already-member" });

    const res = await POST(jsonRequest({ decision: "approve" }), { params: { id: "claim1" } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already-member");
  });

  it("rejects a claim", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, viewer: ADMIN_VIEWER });
    rejectClaimMock.mockResolvedValue(undefined);

    const res = await POST(jsonRequest({ decision: "reject" }), { params: { id: "claim1" } });
    expect(res.status).toBe(200);
    expect(rejectClaimMock).toHaveBeenCalledWith("claim1", "admin1");
    expect(approveClaimMock).not.toHaveBeenCalled();
    expect(sendAdminJoinNotificationMock).not.toHaveBeenCalled();
  });
});
