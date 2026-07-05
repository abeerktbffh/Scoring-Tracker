import { describe, it, expect, vi, beforeEach } from "vitest";

const guardMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireSuperAdmin: guardMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/games", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_GAME = {
  id: "sudoku",
  name: "Sudoku",
  type: "timed",
  metricDirection: "lower_better",
  hasVariants: false,
};

describe("POST /api/admin/games", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    guardMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });
    const res = await POST(jsonRequest(VALID_GAME));
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s a non-super-admin", async () => {
    guardMock.mockResolvedValue({ ok: false, status: 403, error: "Admin only" });
    const res = await POST(new Request("http://localhost/api/admin/games", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });

  it("inserts a catalog game (no group_id) for a super-admin", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: true } });
    sqlMock.mockResolvedValueOnce([]); // existing check
    sqlMock.mockResolvedValueOnce([]); // insert
    const res = await POST(new Request("http://localhost/api/admin/games", {
      method: "POST",
      body: JSON.stringify({ id: "sudoku", name: "Sudoku", type: "timed", metricDirection: "lower_better", hasVariants: false }),
    }));
    expect(res.status).toBe(200);
  });

  it("rejects an invalid game with 422 without ever inserting", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: true } });
    const res = await POST(jsonRequest({ ...VALID_GAME, type: "bogus" }));
    expect(res.status).toBe(422);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate game id with 409 without inserting", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: true } });
    sqlMock.mockResolvedValueOnce([{ id: "sudoku" }]); // existing game
    const res = await POST(jsonRequest(VALID_GAME));
    expect(res.status).toBe(409);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
