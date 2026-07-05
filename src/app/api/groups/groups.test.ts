import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const createGroupMock = vi.fn();
const listMyGroupsMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/groups", () => ({ createGroup: createGroupMock, listMyGroups: listMyGroupsMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET, POST } = await import("./route");

const AUTHED_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Session User",
    isSuperAdmin: false,
  },
};

function jsonRequest(body: unknown, url = "http://localhost/api/groups"): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/groups", () => {
  it("401s when unauthenticated, never touching createGroup", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ name: "Book Club", gameIds: [] }));
    expect(res.status).toBe(401);
    expect(createGroupMock).not.toHaveBeenCalled();
  });

  it("400s on invalid-name", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    createGroupMock.mockResolvedValue({ ok: false, reason: "invalid-name" });

    const res = await POST(jsonRequest({ name: "", gameIds: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("201s with an id and a link containing the invite token", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    createGroupMock.mockResolvedValue({ ok: true, id: "grp_1", token: "tok_abc123" });

    const res = await POST(
      jsonRequest({ name: "Book Club", gameIds: ["g_wordle"] }, "http://localhost/api/groups")
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("grp_1");
    expect(body.link).toContain("tok_abc123");
    expect(body.link).toBe("http://localhost/?join=tok_abc123");
    expect(createGroupMock).toHaveBeenCalledWith("u1", "Book Club", ["g_wordle"]);
  });
});

describe("GET /api/groups", () => {
  it("401s when unauthenticated", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(listMyGroupsMock).not.toHaveBeenCalled();
  });

  it("returns the caller's groups", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    listMyGroupsMock.mockResolvedValue([{ id: "grp_1", name: "Book Club", role: "admin" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ groups: [{ id: "grp_1", name: "Book Club", role: "admin" }] });
    expect(listMyGroupsMock).toHaveBeenCalledWith("u1");
  });
});
