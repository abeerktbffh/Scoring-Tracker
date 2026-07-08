import { describe, it, expect, vi, beforeEach } from "vitest";

const guardMock = vi.fn();
const sqlMock = vi.fn();
vi.mock("@/lib/membership", () => ({ requireUser: guardMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");
beforeEach(() => vi.clearAllMocks());

describe("POST /api/me/import-token", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    guardMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("mints a token, stores only the hash, returns the plaintext once", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: false } });
    sqlMock.mockResolvedValue(undefined);
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(19);
    // The UPDATE must bind the HASH, not the plaintext token.
    const call = sqlMock.mock.calls[0];
    expect(call.slice(1)).not.toContain(body.token);
  });

  it("rotates: two calls yield different tokens", async () => {
    guardMock.mockResolvedValue({ ok: true, viewer: { userId: "u1", displayName: "A", isSuperAdmin: false } });
    sqlMock.mockResolvedValue(undefined);
    const t1 = await (await POST()).json();
    const t2 = await (await POST()).json();
    expect(t1.token).not.toBe(t2.token);
  });
});
