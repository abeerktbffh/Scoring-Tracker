import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/players/rename", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ADMIN_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "admin1",
    player: { id: "pAdmin", displayName: "Admin" },
    isAdmin: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/players/rename", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ playerId: "p1", newName: "New Name" }));
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin member, never touching the DB", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(jsonRequest({ playerId: "p1", newName: "New Name" }));
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("does not authorize based on a client-supplied adminPassphrase", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(
      jsonRequest({ playerId: "p1", newName: "New Name", adminPassphrase: "whatever" }),
    );
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("renames the player for an admin", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);
    sqlMock
      .mockResolvedValueOnce([{ id: "p1" }]) // player exists
      .mockResolvedValueOnce([]) // no name clash
      .mockResolvedValueOnce([]); // update

    const res = await POST(jsonRequest({ playerId: "p1", newName: " New Name " }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const updateCall = sqlMock.mock.calls[2];
    const [strings, ...values] = updateCall as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("UPDATE players");
    expect(values).toContain("New Name");
  });

  it("400s when playerId or newName are missing/blank", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);

    const res = await POST(jsonRequest({ playerId: "p1", newName: "   " }));
    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("404s when the player does not exist in the group", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);
    sqlMock.mockResolvedValueOnce([]); // no player found

    const res = await POST(jsonRequest({ playerId: "missing", newName: "New Name" }));
    expect(res.status).toBe(404);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("409s when the new name is already taken", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);
    sqlMock
      .mockResolvedValueOnce([{ id: "p1" }]) // player exists
      .mockResolvedValueOnce([{ id: "p2" }]); // name clash

    const res = await POST(jsonRequest({ playerId: "p1", newName: "Taken Name" }));
    expect(res.status).toBe(409);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
