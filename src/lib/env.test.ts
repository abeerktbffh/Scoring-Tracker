import { describe, it, expect } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  it("returns the value when set", () => {
    process.env.SOME_KEY = "hello";
    expect(getEnv("SOME_KEY")).toBe("hello");
  });

  it("throws when missing", () => {
    delete process.env.MISSING_KEY;
    expect(() => getEnv("MISSING_KEY")).toThrow("Missing env var: MISSING_KEY");
  });
});
