import { describe, it, expect } from "vitest";
import { sql } from "./client";

describe("db client", () => {
  it("exports a callable sql tagged-template function", () => {
    expect(typeof sql).toBe("function");
  });
});
