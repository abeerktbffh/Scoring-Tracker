import { describe, it, expect, vi, beforeEach } from "vitest";

const guardMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireSuperAdmin: guardMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/games", () => {
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
});
