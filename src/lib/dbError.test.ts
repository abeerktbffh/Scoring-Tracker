import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "./dbError";
describe("isUniqueViolation", () => {
  it("true for matching code+constraint", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "x_uq" }, "x_uq")).toBe(true);
  });
  it("false for other constraint or code, or non-object", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "y" }, "x_uq")).toBe(false);
    expect(isUniqueViolation({ code: "23502", constraint: "x_uq" }, "x_uq")).toBe(false);
    expect(isUniqueViolation(undefined, "x_uq")).toBe(false);
  });
});
