import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { canClaim, createFreshPlayer } = await import("./claims");
type ClaimablePlayer = Parameters<typeof canClaim>[0];

function player(overrides: Partial<ClaimablePlayer> = {}): ClaimablePlayer {
  return { userId: null, archived: false, ...overrides };
}

describe("canClaim", () => {
  it("rejects an archived player", () => {
    expect(canClaim(player({ archived: true }), false, false)).toBe(false);
  });

  it("rejects a player already linked to a user", () => {
    expect(canClaim(player({ userId: "u1" }), false, false)).toBe(false);
  });

  it("rejects when the claiming user already has a player in the group", () => {
    expect(canClaim(player(), true, false)).toBe(false);
  });

  it("rejects when a pending claim already exists for the player", () => {
    expect(canClaim(player(), false, true)).toBe(false);
  });

  it("allows the claim when the player is unclaimed/unarchived, the user has no player, and no pending claim exists", () => {
    expect(canClaim(player(), false, false)).toBe(true);
  });

  it("rejects when multiple disqualifying conditions hold at once", () => {
    expect(canClaim(player({ archived: true, userId: "u1" }), true, true)).toBe(false);
  });
});

describe("createFreshPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:false reason:name-taken when a case-insensitive dup already exists", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "existing1" }]); // pre-check finds a match

    const result = await createFreshPlayer("u1", "g1", "Abeer");

    expect(result).toEqual({ ok: false, reason: "name-taken" });
    expect(sqlMock).toHaveBeenCalledTimes(1); // never attempted the INSERT
  });

  it("returns ok:true with the new id when the name is free", async () => {
    sqlMock
      .mockResolvedValueOnce([]) // pre-check: no match
      .mockResolvedValueOnce([]); // INSERT succeeds

    const result = await createFreshPlayer("u1", "g1", "Abeer");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);
    }
  });

  it("returns ok:false reason:name-taken when the INSERT races and hits the unique index", async () => {
    sqlMock.mockResolvedValueOnce([]); // pre-check: no match (race window)
    const raceError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "players_group_lower_name_uq",
    });
    sqlMock.mockRejectedValueOnce(raceError); // INSERT loses the race

    const result = await createFreshPlayer("u1", "g1", "Abeer");

    expect(result).toEqual({ ok: false, reason: "name-taken" });
  });

  it("rethrows unrelated INSERT errors instead of swallowing them", async () => {
    sqlMock.mockResolvedValueOnce([]); // pre-check: no match
    sqlMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(createFreshPlayer("u1", "g1", "Abeer")).rejects.toThrow("connection reset");
  });
});
