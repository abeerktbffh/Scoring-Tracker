import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken } from "./inviteToken";
describe("invite token", () => {
  it("hash is deterministic sha256 hex (64 chars) and not the token", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
    expect(hashInviteToken(token)).toBe(tokenHash);
  });
  it("two tokens differ", () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });
});
