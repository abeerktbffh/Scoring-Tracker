import { describe, it, expect } from "vitest";
import { hashSecret, verifySecret } from "./hash";

describe("secret hashing", () => {
  it("verifies a correct secret", async () => {
    const stored = await hashSecret("hunter2");
    expect(await verifySecret("hunter2", stored)).toBe(true);
  });

  it("rejects a wrong secret", async () => {
    const stored = await hashSecret("hunter2");
    expect(await verifySecret("wrong", stored)).toBe(false);
  });

  it("produces different hashes for the same input (random salt)", async () => {
    const a = await hashSecret("same");
    const b = await hashSecret("same");
    expect(a).not.toBe(b);
  });
});
