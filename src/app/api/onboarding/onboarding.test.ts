import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const sqlMock = vi.fn();
const resolveViewerMock = vi.fn();
const unclaimedLegacyPlayersMock = vi.fn();
const createPendingClaimMock = vi.fn();
const createFreshPlayerMock = vi.fn();
const migrationActiveMock = vi.fn();
const sendAdminJoinNotificationMock = vi.fn();

vi.mock("@/auth/config", () => ({ auth: authMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/membership", () => ({ resolveViewer: resolveViewerMock }));
vi.mock("@/lib/claims", () => ({
  unclaimedLegacyPlayers: unclaimedLegacyPlayersMock,
  createPendingClaim: createPendingClaimMock,
  createFreshPlayer: createFreshPlayerMock,
  migrationActive: migrationActiveMock,
}));
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
  migrationActiveMock.mockResolvedValue(false);
  unclaimedLegacyPlayersMock.mockResolvedValue([]);
});

describe("GET /api/onboarding", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports alreadyMember=true and needsInvite=false for an existing member", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    resolveViewerMock.mockResolvedValue({ userId: "u1", player: { id: "p1", displayName: "A" }, isAdmin: false });

    const res = await GET();
    const body = await res.json();
    expect(body.alreadyMember).toBe(true);
    expect(body.needsInvite).toBe(false);
  });

  it("reports needsInvite=true for a non-member with no eligibility row", async () => {
    authMock.mockResolvedValue({ user: { id: "u2" } });
    resolveViewerMock.mockResolvedValue({ userId: "u2", player: null, isAdmin: false });
    sqlMock.mockResolvedValue([]); // no eligibility row

    const res = await GET();
    const body = await res.json();
    expect(body.alreadyMember).toBe(false);
    expect(body.needsInvite).toBe(true);
  });

  it("reports needsInvite=false for a non-member with an unexpired eligibility row", async () => {
    authMock.mockResolvedValue({ user: { id: "u3" } });
    resolveViewerMock.mockResolvedValue({ userId: "u3", player: null, isAdmin: false });
    sqlMock.mockResolvedValue([{ "?column?": 1 }]); // eligibility row present

    const res = await GET();
    const body = await res.json();
    expect(body.needsInvite).toBe(false);
  });

  it("includes unclaimed players only when migration is active", async () => {
    authMock.mockResolvedValue({ user: { id: "u4" } });
    resolveViewerMock.mockResolvedValue({ userId: "u4", player: null, isAdmin: false });
    migrationActiveMock.mockResolvedValue(true);
    unclaimedLegacyPlayersMock.mockResolvedValue([{ id: "p9", displayName: "Legacy" }]);

    const res = await GET();
    const body = await res.json();
    expect(body.migrationActive).toBe(true);
    expect(body.unclaimed).toEqual([{ id: "p9", displayName: "Legacy" }]);
  });
});

describe("POST /api/onboarding", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(jsonRequest({ action: "create", displayName: "X" }));
    expect(res.status).toBe(401);
  });

  it("403s a non-member with no eligibility row, never reaching the libs", async () => {
    authMock.mockResolvedValue({ user: { id: "u5" } });
    resolveViewerMock.mockResolvedValue({ userId: "u5", player: null, isAdmin: false });
    sqlMock.mockResolvedValue([]); // no eligibility

    const res = await POST(jsonRequest({ action: "create", displayName: "Eve" }));
    expect(res.status).toBe(403);
    expect(createFreshPlayerMock).not.toHaveBeenCalled();
    expect(createPendingClaimMock).not.toHaveBeenCalled();
  });

  it("allows action=claim for an eligible non-member and calls createPendingClaim", async () => {
    authMock.mockResolvedValue({ user: { id: "u6" } });
    resolveViewerMock.mockResolvedValue({ userId: "u6", player: null, isAdmin: false });
    sqlMock.mockResolvedValue([{ "?column?": 1 }]); // eligible
    createPendingClaimMock.mockResolvedValue({ ok: true });

    const res = await POST(jsonRequest({ action: "claim", playerId: "p1" }));
    expect(res.status).toBe(200);
    expect(createPendingClaimMock).toHaveBeenCalledWith("u6", "p1");
    expect(sendAdminJoinNotificationMock).not.toHaveBeenCalled();
  });

  it("maps a failed claim to a 4xx with the lib's reason", async () => {
    authMock.mockResolvedValue({ user: { id: "u7" } });
    resolveViewerMock.mockResolvedValue({ userId: "u7", player: null, isAdmin: false });
    sqlMock.mockResolvedValue([{ "?column?": 1 }]);
    createPendingClaimMock.mockResolvedValue({ ok: false, reason: "already-member" });

    const res = await POST(jsonRequest({ action: "claim", playerId: "p1" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(body.error).toBe("already-member");
  });

  it("allows action=create for an eligible non-member, sends notification, and clears eligibility", async () => {
    authMock.mockResolvedValue({ user: { id: "u8" } });
    resolveViewerMock.mockResolvedValue({ userId: "u8", player: null, isAdmin: false });
    // First sql call = eligibility check, second = email lookup, third = clear eligibility.
    sqlMock
      .mockResolvedValueOnce([{ "?column?": 1 }]) // eligible
      .mockResolvedValueOnce([{ email: "eve@example.com" }]) // user email lookup
      .mockResolvedValueOnce([]); // delete eligibility
    createFreshPlayerMock.mockResolvedValue({ id: "p10" });

    const res = await POST(jsonRequest({ action: "create", displayName: "Eve" }));
    expect(res.status).toBe(200);
    expect(createFreshPlayerMock).toHaveBeenCalledWith("u8", "g1", "Eve");
    expect(sendAdminJoinNotificationMock).toHaveBeenCalledWith("Eve", "eve@example.com");
  });

  it("allows action=create for an already-existing member even without an eligibility row", async () => {
    authMock.mockResolvedValue({ user: { id: "u9" } });
    resolveViewerMock.mockResolvedValue({ userId: "u9", player: { id: "p1", displayName: "A" }, isAdmin: false });
    sqlMock.mockResolvedValue([{ email: "member@example.com" }]);
    createFreshPlayerMock.mockResolvedValue({ id: "p11" });

    const res = await POST(jsonRequest({ action: "create", displayName: "Second" }));
    expect(res.status).toBe(200);
    expect(createFreshPlayerMock).toHaveBeenCalled();
  });

  it("400s an unknown action", async () => {
    authMock.mockResolvedValue({ user: { id: "u10" } });
    resolveViewerMock.mockResolvedValue({ userId: "u10", player: { id: "p1", displayName: "A" }, isAdmin: false });

    const res = await POST(jsonRequest({ action: "nope" }));
    expect(res.status).toBe(400);
  });
});
