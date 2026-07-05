import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const sqlMock = vi.fn();
const resolveViewerMock = vi.fn();
const setDisplayNameMock = vi.fn();
const sendAdminJoinNotificationMock = vi.fn();

vi.mock("@/auth/config", () => ({ auth: authMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/membership", () => ({ resolveViewer: resolveViewerMock }));
vi.mock("@/lib/identity", () => ({ setDisplayName: setDisplayNameMock }));
vi.mock("@/lib/email", () => ({ sendAdminJoinNotification: sendAdminJoinNotificationMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET, POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/onboarding", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockResolvedValue([]);
});

describe("GET /api/onboarding", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports alreadyMember=true when the viewer has a display name", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    resolveViewerMock.mockResolvedValue({ userId: "u1", displayName: "A", isSuperAdmin: false });

    const res = await GET();
    const body = await res.json();
    expect(body.alreadyMember).toBe(true);
    expect(body.isSuperAdmin).toBe(false);
  });

  it("reports alreadyMember=false when the viewer has no display name", async () => {
    authMock.mockResolvedValue({ user: { id: "u2" } });
    resolveViewerMock.mockResolvedValue({ userId: "u2", displayName: null, isSuperAdmin: false });

    const res = await GET();
    const body = await res.json();
    expect(body.alreadyMember).toBe(false);
  });

  it("reports isSuperAdmin=true when the viewer is a super admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u7" } });
    resolveViewerMock.mockResolvedValue({ userId: "u7", displayName: "Admin", isSuperAdmin: true });

    const res = await GET();
    const body = await res.json();
    expect(body.isSuperAdmin).toBe(true);
  });
});

describe("POST /api/onboarding", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(jsonRequest({ displayName: "X" }));
    expect(res.status).toBe(401);
  });

  it("400s an empty display name", async () => {
    authMock.mockResolvedValue({ user: { id: "u3" } });
    const res = await POST(jsonRequest({ displayName: "   " }));
    expect(res.status).toBe(400);
    expect(setDisplayNameMock).not.toHaveBeenCalled();
  });

  it("400s a display name longer than 40 characters", async () => {
    authMock.mockResolvedValue({ user: { id: "u3b" } });
    const res = await POST(jsonRequest({ displayName: "a".repeat(41) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Name must be 40 characters or fewer");
    expect(setDisplayNameMock).not.toHaveBeenCalled();
  });

  it("409s with a clean error when the name is taken", async () => {
    authMock.mockResolvedValue({ user: { id: "u4" } });
    setDisplayNameMock.mockResolvedValue({ ok: false, reason: "name-taken" });

    const res = await POST(jsonRequest({ displayName: "abeer" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("That name is taken — pick another.");
    // Must not proceed to email lookup / notification on failure.
    expect(sqlMock).not.toHaveBeenCalled();
    expect(sendAdminJoinNotificationMock).not.toHaveBeenCalled();
  });

  it("sets the global display name, trims it, and fires the admin notification with the looked-up email", async () => {
    authMock.mockResolvedValue({ user: { id: "u5" } });
    setDisplayNameMock.mockResolvedValue({ ok: true });
    sqlMock.mockResolvedValueOnce([{ email: "eve@example.com" }]);

    const res = await POST(jsonRequest({ displayName: "  Eve  " }));
    expect(res.status).toBe(200);
    expect(setDisplayNameMock).toHaveBeenCalledWith("u5", "Eve");
    expect(sendAdminJoinNotificationMock).toHaveBeenCalledWith("Eve", "eve@example.com");
  });

  it("does not fire the admin notification when the user has no email on file", async () => {
    authMock.mockResolvedValue({ user: { id: "u6" } });
    setDisplayNameMock.mockResolvedValue({ ok: true });
    sqlMock.mockResolvedValueOnce([{ email: null }]);

    const res = await POST(jsonRequest({ displayName: "Eve" }));
    expect(res.status).toBe(200);
    expect(sendAdminJoinNotificationMock).not.toHaveBeenCalled();
  });
});
