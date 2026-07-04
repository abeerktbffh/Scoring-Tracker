import { describe, it, expect } from "vitest";
import { canClaim, type ClaimablePlayer } from "./claims";

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
