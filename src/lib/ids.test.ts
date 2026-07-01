import { describe, it, expect } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("prefixes and is unique", () => {
    const a = newId("e");
    const b = newId("e");
    expect(a.startsWith("e_")).toBe(true);
    expect(a).not.toBe(b);
  });
});
