import { describe, it, expect, vi, beforeEach } from "vitest";
const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/ids", () => ({ newId: (p: string) => `${p}_test` }));
vi.mock("@/lib/inviteToken", () => ({ generateInviteToken: () => ({ token: "tok", tokenHash: "hash" }) }));
const { createGroup, listMyGroups } = await import("./groups");
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
