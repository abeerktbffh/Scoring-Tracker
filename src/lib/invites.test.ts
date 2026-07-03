import { describe, it, expect } from "vitest";
import { hashInviteToken, newInviteToken, classifyInvite } from "./invites";

describe("invites", () => {
  it("hashes deterministically to 64 hex", () => {
    const h = hashInviteToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken("abc")).toBe(h);
  });

  it("newInviteToken hash matches", () => {
    const { token, tokenHash } = newInviteToken();
    expect(hashInviteToken(token)).toBe(tokenHash);
  });

  it("newInviteToken produces distinct tokens", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("classifyInvite flags states", () => {
    const now = Date.parse("2026-07-03T00:00:00Z");
    expect(
      classifyInvite({ revoked: true, expires_at: "2099-01-01", uses: 0, max_uses: null }, now),
    ).toBe("revoked");
    expect(
      classifyInvite({ revoked: false, expires_at: "2000-01-01", uses: 0, max_uses: null }, now),
    ).toBe("expired");
    expect(
      classifyInvite({ revoked: false, expires_at: "2099-01-01", uses: 5, max_uses: 5 }, now),
    ).toBe("exhausted");
    expect(
      classifyInvite({ revoked: false, expires_at: "2099-01-01", uses: 0, max_uses: null }, now),
    ).toBe("ok");
  });

  it("classifyInvite checks revoked before expired", () => {
    const now = Date.parse("2026-07-03T00:00:00Z");
    expect(
      classifyInvite({ revoked: true, expires_at: "2000-01-01", uses: 0, max_uses: null }, now),
    ).toBe("revoked");
  });

  it("classifyInvite checks expired before exhausted", () => {
    const now = Date.parse("2026-07-03T00:00:00Z");
    expect(
      classifyInvite({ revoked: false, expires_at: "2000-01-01", uses: 5, max_uses: 5 }, now),
    ).toBe("expired");
  });

  it("classifyInvite treats uses below max_uses as ok", () => {
    const now = Date.parse("2026-07-03T00:00:00Z");
    expect(
      classifyInvite({ revoked: false, expires_at: "2099-01-01", uses: 4, max_uses: 5 }, now),
    ).toBe("ok");
  });
});
