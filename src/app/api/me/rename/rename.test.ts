import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const setDisplayNameMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/identity", () => ({ setDisplayName: setDisplayNameMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/me/rename", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const USER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Old Name",
    isSuperAdmin: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/me/rename", () => {
  it("401s when unauthenticated, never touching setDisplayName", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ newName: "New Name" }));
    expect(res.status).toBe(401);
    expect(setDisplayNameMock).not.toHaveBeenCalled();
  });

  it("400s when newName is missing or blank", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);

    const res = await POST(jsonRequest({ newName: "   " }));
    expect(res.status).toBe(400);
    expect(setDisplayNameMock).not.toHaveBeenCalled();
  });

  it("400s when newName exceeds 40 characters", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);

    const res = await POST(jsonRequest({ newName: "x".repeat(41) }));
    expect(res.status).toBe(400);
    expect(setDisplayNameMock).not.toHaveBeenCalled();
  });

  it("409s when setDisplayName reports the name is taken", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    setDisplayNameMock.mockResolvedValue({ ok: false, reason: "name-taken" });

    const res = await POST(jsonRequest({ newName: "abeer" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("That name is taken — pick another.");
    expect(setDisplayNameMock).toHaveBeenCalledWith("u1", "abeer");
  });

  it("renames on success, using identity from requireUser (not the request body)", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    setDisplayNameMock.mockResolvedValue({ ok: true });

    const res = await POST(jsonRequest({ newName: " New Name ", playerId: "someone-elses-id" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, displayName: "New Name" });

    expect(setDisplayNameMock).toHaveBeenCalledWith("u1", "New Name");
  });

  it("ignores a body-supplied userId and targets only the session user", async () => {
    requireUserMock.mockResolvedValue(USER_VIEWER);
    setDisplayNameMock.mockResolvedValue({ ok: true });

    const res = await POST(jsonRequest({ newName: "New Name", userId: "someone-elses-id" }));
    expect(res.status).toBe(200);

    expect(setDisplayNameMock).toHaveBeenCalledWith("u1", "New Name");
    expect(setDisplayNameMock).not.toHaveBeenCalledWith("someone-elses-id", expect.anything());
  });
});
