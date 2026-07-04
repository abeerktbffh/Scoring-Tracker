import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/games", {
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

const VALID_GAME = {
  id: "wordle",
  name: "Wordle",
  type: "outcome",
  metricDirection: "lower_better",
  hasVariants: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/games", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest(VALID_GAME));
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin member, never touching the DB", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(jsonRequest(VALID_GAME));
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("does not authorize based on a client-supplied adminPassphrase", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });

    const res = await POST(jsonRequest({ ...VALID_GAME, adminPassphrase: "whatever" }));
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("creates the game for an admin", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);
    sqlMock
      .mockResolvedValueOnce([]) // no existing game
      .mockResolvedValueOnce([]); // insert

    const res = await POST(jsonRequest(VALID_GAME));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.game.id).toBe("wordle");

    const insertCall = sqlMock.mock.calls[1];
    const [strings, ...values] = insertCall as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("INSERT INTO games");
    expect(values).toContain("g1");
  });

  it("rejects an invalid game with 422 without ever inserting", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);

    const res = await POST(jsonRequest({ ...VALID_GAME, type: "bogus" }));
    expect(res.status).toBe(422);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate game id with 409 without inserting", async () => {
    requireAdminMock.mockResolvedValue(ADMIN_VIEWER);
    sqlMock.mockResolvedValueOnce([{ id: "wordle" }]); // existing game

    const res = await POST(jsonRequest(VALID_GAME));
    expect(res.status).toBe(409);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
