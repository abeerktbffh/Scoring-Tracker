import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
const authMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/auth/config", () => ({ auth: authMock }));

const { resolveViewer, authzResult, requireUser, requireSuperAdmin, roleFor, requireMember, requireGroupAdmin } =
  await import("./membership");

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

describe("group guards", () => {
  it("roleFor returns the role or null", () => {
    expect(roleFor([{ role: "admin" }])).toBe("admin");
    expect(roleFor([{ role: "member" }])).toBe("member");
    expect(roleFor([])).toBeNull();
  });
  it("requireMember 403s a non-member", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "A", is_super_admin: false }]); // resolveViewer
    sqlMock.mockResolvedValueOnce([]); // no membership row
    const r = await requireMember("g_x");
    expect(r).toEqual({ ok: false, status: 403, error: "Not a member" });
  });
  it("requireGroupAdmin 403s a plain member but allows an admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "A", is_super_admin: false }]);
    sqlMock.mockResolvedValueOnce([{ role: "member" }]);
    expect((await requireGroupAdmin("g_x")).ok).toBe(false);

    authMock.mockResolvedValue({ user: { id: "u2" } });
    sqlMock.mockResolvedValueOnce([{ display_name: "B", is_super_admin: false }]);
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    expect((await requireGroupAdmin("g_x")).ok).toBe(true);
  });
});
