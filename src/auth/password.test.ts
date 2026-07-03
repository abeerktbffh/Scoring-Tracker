import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";
describe("password hashing", () => {
  it("round-trips and encodes explicit params", async () => {
    const h = await hashPassword("s3cret!");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("s3cret!", h)).toBe(true);
  });
  it("rejects wrong password and malformed hashes", async () => {
    const h = await hashPassword("right");
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
