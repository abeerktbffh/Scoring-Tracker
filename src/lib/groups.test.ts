import { describe, it, expect, vi, beforeEach } from "vitest";
const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/ids", () => ({ newId: (p: string) => `${p}_test` }));
vi.mock("@/lib/inviteToken", () => ({
  generateInviteToken: () => ({ token: "tok", tokenHash: "hash" }),
  hashInviteToken: (t: string) => `h(${t})`,
}));
const { createGroup, listMyGroups, joinViaToken, groupPreviewByToken } = await import("./groups");
beforeEach(() => { vi.clearAllMocks(); sqlMock.mockResolvedValue([]); });

describe("createGroup", () => {
  it("rejects an empty name without touching the DB", async () => {
    const r = await createGroup("u1", "   ", ["wordle"]);
    expect(r).toEqual({ ok: false, reason: "invalid-name" });
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("rejects a name over 40 chars", async () => {
    const r = await createGroup("u1", "x".repeat(41), []);
    expect(r).toEqual({ ok: false, reason: "invalid-name" });
  });
  it("creates group + admin membership + group_games + token", async () => {
    const r = await createGroup("u1", "  Family  ", ["wordle", "mini"]);
    expect(r).toEqual({ ok: true, id: "grp_test", token: "tok" });
    const sqlText = sqlMock.mock.calls.map((c) => String(c[0].join("?"))).join("\n");
    expect(sqlText).toContain("INSERT INTO groups");
    expect(sqlText).toContain("INSERT INTO memberships");
    expect(sqlText).toContain("INSERT INTO group_games");
    // trimmed name bound
    expect(sqlMock.mock.calls.flatMap((c) => c.slice(1))).toContain("Family");
  });
});

describe("listMyGroups", () => {
  it("maps rows to {id,name,role}", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1", name: "Fam", role: "admin" }]);
    expect(await listMyGroups("u1")).toEqual([{ id: "g1", name: "Fam", role: "admin" }]);
  });
});

describe("joinViaToken", () => {
  it("invalid token → invalid-token", async () => {
    sqlMock.mockResolvedValueOnce([]); // group lookup by hash: none
    expect(await joinViaToken("u1", "bad")).toEqual({ ok: false, reason: "invalid-token" });
  });
  it("valid token inserts a member membership", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1" }]); // group found
    sqlMock.mockResolvedValueOnce([]); // insert membership
    expect(await joinViaToken("u1", "good")).toEqual({ ok: true, groupId: "g1" });
  });
  it("already-member (23505) is treated as success", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1" }]);
    sqlMock.mockRejectedValueOnce({ code: "23505", constraint: "memberships_group_user_uq" });
    expect(await joinViaToken("u1", "good")).toEqual({ ok: true, groupId: "g1" });
  });
  it("rethrows unrelated errors", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1" }]);
    sqlMock.mockRejectedValueOnce({ code: "23505", constraint: "some_other_constraint" });
    await expect(joinViaToken("u1", "good")).rejects.toBeTruthy();
  });
});

describe("groupPreviewByToken", () => {
  it("returns null when token doesn't match a group", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await groupPreviewByToken("bad")).toBeNull();
  });
  it("maps row to preview shape", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "g1", name: "Fam", member_count: 3, game_count: 2 }]);
    expect(await groupPreviewByToken("good")).toEqual({
      id: "g1",
      name: "Fam",
      memberCount: 3,
      gameCount: 2,
    });
  });
});
