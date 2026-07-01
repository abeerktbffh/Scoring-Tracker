import { describe, it, expect } from "vitest";
import { issueGroupToken, verifyGroupToken } from "./token";

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
});
