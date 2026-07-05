import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const joinViaTokenMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/groups", () => ({ joinViaToken: joinViaTokenMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { POST } = await import("./route");

const AUTHED_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Session User",
    isSuperAdmin: false,
  },
};

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/groups/join", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/groups/join", () => {
  it("401s when unauthenticated, never touching joinViaToken", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ token: "tok_abc" }));
    expect(res.status).toBe(401);
    expect(joinViaTokenMock).not.toHaveBeenCalled();
  });

  it("400s when the token is missing", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);

    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
    expect(joinViaTokenMock).not.toHaveBeenCalled();
  });

  it("400s on invalid-token", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    joinViaTokenMock.mockResolvedValue({ ok: false, reason: "invalid-token" });

    const res = await POST(jsonRequest({ token: "bad-token" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("200s with ok + groupId on success", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    joinViaTokenMock.mockResolvedValue({ ok: true, groupId: "grp_1" });

    const res = await POST(jsonRequest({ token: "tok_abc" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, groupId: "grp_1" });
    expect(joinViaTokenMock).toHaveBeenCalledWith("u1", "tok_abc");
  });
});
