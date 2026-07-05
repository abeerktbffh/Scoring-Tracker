import { describe, it, expect, vi, beforeEach } from "vitest";
const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/ids", () => ({ newId: (p: string) => `${p}_test` }));
vi.mock("@/lib/inviteToken", () => ({
  generateInviteToken: () => ({ token: "tok", tokenHash: "hash" }),
  hashInviteToken: (t: string) => `h(${t})`,
}));
const {
  createGroup,
  listMyGroups,
  joinViaToken,
  groupPreviewByToken,
  leaveGroup,
  removeMember,
  renameGroup,
  setGroupGames,
  resetInvite,
  getGroupInvite,
  listGroupMembers,
} = await import("./groups");
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
  it("binds both the token hash and the plaintext token on the INSERT", async () => {
    await createGroup("u1", "Family", []);
    const insertCall = sqlMock.mock.calls.find((c) => String(c[0].join("?")).includes("INSERT INTO groups"));
    const sqlText = insertCall![0].join("?");
    expect(sqlText).toContain("invite_token_hash");
    expect(sqlText).toMatch(/invite_token\)/); // column list includes plain invite_token, not just the _hash one
    expect(insertCall!.slice(1)).toContain("hash");
    expect(insertCall!.slice(1)).toContain("tok");
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

describe("leaveGroup", () => {
  it("runs delete-self, then conditional promote, then conditional group-delete", async () => {
    sqlMock.mockResolvedValue([]);
    await leaveGroup("u1", "g1");
    const texts = sqlMock.mock.calls.map((c) => String(c[0].join("?")));
    expect(texts[0]).toContain("DELETE FROM memberships");
    expect(texts[1]).toContain("UPDATE memberships SET role = 'admin'");
    expect(texts[1]).toContain("NOT EXISTS");
    expect(texts[2]).toContain("DELETE FROM groups");
    expect(texts[2]).toContain("NOT EXISTS");
  });
});
describe("removeMember", () => {
  it("deletes the target then reconciles admin/empty", async () => {
    sqlMock.mockResolvedValue([]);
    await removeMember("g1", "u2");
    const texts = sqlMock.mock.calls.map((c) => String(c[0].join("?")));
    expect(texts[0]).toContain("DELETE FROM memberships");
    expect(texts.some((t) => t.includes("UPDATE memberships SET role = 'admin'"))).toBe(true);
    expect(texts.some((t) => t.includes("DELETE FROM groups"))).toBe(true);
  });
});

describe("renameGroup", () => {
  it("empty → invalid-name, no update", async () => {
    expect(await renameGroup("g1", "  ")).toEqual({ ok: false, reason: "invalid-name" });
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("valid trims + updates", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await renameGroup("g1", " Fam ")).toEqual({ ok: true });
    expect(sqlMock.mock.calls[0].slice(1)).toContain("Fam");
  });
});
describe("setGroupGames", () => {
  it("clears then inserts", async () => {
    sqlMock.mockResolvedValue([]);
    await setGroupGames("g1", ["wordle"]);
    const texts = sqlMock.mock.calls.map((c) => String(c[0].join("?")));
    expect(texts[0]).toContain("DELETE FROM group_games");
    expect(texts.some((t) => t.includes("INSERT INTO group_games"))).toBe(true);
  });
});
describe("resetInvite", () => {
  it("returns a token and updates the hash", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await resetInvite("g1")).toEqual({ token: "tok" }); // per generateInviteToken mock
  });
  it("also binds the plaintext token in the same UPDATE", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await resetInvite("g1");
    const sqlText = sqlMock.mock.calls[0][0].join("?");
    expect(sqlText).toContain("invite_token_hash = ?");
    expect(sqlText).toContain("invite_token = ?");
    expect(sqlMock.mock.calls[0].slice(1)).toContain("hash");
    expect(sqlMock.mock.calls[0].slice(1)).toContain("tok");
  });
});

describe("listGroupMembers", () => {
  it("maps joined rows to {userId,displayName,role}", async () => {
    sqlMock.mockResolvedValueOnce([
      { user_id: "u1", display_name: "Ada", role: "admin" },
      { user_id: "u2", display_name: "Bea", role: "member" },
    ]);
    expect(await listGroupMembers("g1")).toEqual([
      { userId: "u1", displayName: "Ada", role: "admin" },
      { userId: "u2", displayName: "Bea", role: "member" },
    ]);
  });
  it("joins memberships to users and orders admins first, then by name", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await listGroupMembers("g1");
    const sqlText = sqlMock.mock.calls[0][0].join("?");
    expect(sqlText).toContain("JOIN users");
    expect(sqlText).toContain("FROM memberships");
    expect(sqlText).toContain("ORDER BY");
    expect(sqlMock.mock.calls[0].slice(1)).toContain("g1");
  });
  it("passes through a null display_name", async () => {
    sqlMock.mockResolvedValueOnce([{ user_id: "u1", display_name: null, role: "member" }]);
    expect(await listGroupMembers("g1")).toEqual([{ userId: "u1", displayName: null, role: "member" }]);
  });
});

describe("getGroupInvite", () => {
  it("returns null when the group has no token", async () => {
    sqlMock.mockResolvedValueOnce([{ invite_token: null }]);
    expect(await getGroupInvite("g1")).toBeNull();
  });
  it("returns null when the group doesn't exist", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await getGroupInvite("missing")).toBeNull();
  });
  it("returns the token when present", async () => {
    sqlMock.mockResolvedValueOnce([{ invite_token: "tok_current" }]);
    expect(await getGroupInvite("g1")).toEqual({ token: "tok_current" });
  });
});
