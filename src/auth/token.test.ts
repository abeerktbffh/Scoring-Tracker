import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { issueGroupToken, verifyGroupToken } from "./token";

function key(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

describe("group token", () => {
  it("round-trips a valid token", async () => {
    const token = await issueGroupToken("g1");
    expect(await verifyGroupToken(token)).toEqual({ groupId: "g1" });
  });

  it("returns null for a tampered token", async () => {
    const token = await issueGroupToken("g1");
    expect(await verifyGroupToken(token + "x")).toBeNull();
  });

  it("returns null for garbage", async () => {
    expect(await verifyGroupToken("not-a-token")).toBeNull();
  });

  it("returns null for a token whose groupId payload is not a string", async () => {
    const token = await new SignJWT({ groupId: 123 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(key());
    expect(await verifyGroupToken(token)).toBeNull();
  });
});
