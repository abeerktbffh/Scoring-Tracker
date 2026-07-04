import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
const authMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/auth/config", () => ({ auth: authMock }));

const { resolveViewer, authzResult, requireUser, requireSuperAdmin } = await import("./membership");

beforeEach(() => vi.clearAllMocks());

describe("resolveViewer", () => {
  it("returns null when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    expect(await resolveViewer()).toBeNull();
  });
  it("reads display name + super-admin from users (never the JWT)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "Abeer", is_super_admin: true }]);
    expect(await resolveViewer()).toEqual({ userId: "u1", displayName: "Abeer", isSuperAdmin: true });
  });
  it("tolerates a user row with no name yet", async () => {
    authMock.mockResolvedValue({ user: { id: "u9" } });
    sqlMock.mockResolvedValueOnce([{ display_name: null, is_super_admin: false }]);
    expect(await resolveViewer()).toEqual({ userId: "u9", displayName: null, isSuperAdmin: false });
  });
});

describe("authzResult", () => {
  it("unauthenticated when no viewer", () => {
    expect(authzResult(null, "user")).toBe("unauthenticated");
  });
  it("ok for any authenticated user when need=user", () => {
    expect(authzResult({ userId: "u1", displayName: "A", isSuperAdmin: false }, "user")).toBe("ok");
  });
  it("not-super-admin when need=super-admin and flag is false", () => {
    expect(authzResult({ userId: "u1", displayName: "A", isSuperAdmin: false }, "super-admin")).toBe("not-super-admin");
  });
  it("ok when need=super-admin and flag is true", () => {
    expect(authzResult({ userId: "u1", displayName: "A", isSuperAdmin: true }, "super-admin")).toBe("ok");
  });
});

describe("guards", () => {
  it("requireUser 401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const r = await requireUser();
    expect(r).toEqual({ ok: false, status: 401, error: "Unauthenticated" });
  });
  it("requireSuperAdmin 403s a normal user", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "A", is_super_admin: false }]);
    const r = await requireSuperAdmin();
    expect(r).toEqual({ ok: false, status: 403, error: "Admin only" });
  });
});
