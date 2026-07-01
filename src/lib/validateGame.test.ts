import { describe, it, expect } from "vitest";
import { validateNewGame } from "./validateGame";

describe("validateNewGame", () => {
  it("accepts and normalizes a valid game", () => {
    expect(validateNewGame({
      id: "strands", name: "Strands", type: "outcome",
      metricDirection: "lower_better", hasVariants: false,
    })).toEqual({
      id: "strands", name: "Strands", type: "outcome",
      metricDirection: "lower_better", hasVariants: false, parserId: null,
    });
  });
  it("defaults hasVariants to false and parserId to null", () => {
    const r = validateNewGame({ id: "zip", name: "Zip", type: "timed", metricDirection: "lower_better" });
    expect(r).toEqual({
      id: "zip", name: "Zip", type: "timed", metricDirection: "lower_better",
      hasVariants: false, parserId: null,
    });
  });
  it("rejects a bad id", () => {
    expect(validateNewGame({ id: "Bad ID!", name: "X", type: "timed", metricDirection: "lower_better" }))
      .toEqual({ error: "Invalid game id (use lowercase letters, digits, hyphens)" });
  });
  it("rejects an unknown type", () => {
    expect(validateNewGame({ id: "x", name: "X", type: "score", metricDirection: "lower_better" }))
      .toEqual({ error: "Invalid type" });
  });
  it("rejects an unknown metricDirection", () => {
    expect(validateNewGame({ id: "x", name: "X", type: "timed", metricDirection: "fastest" }))
      .toEqual({ error: "Invalid metricDirection" });
  });
  it("rejects a missing name", () => {
    expect(validateNewGame({ id: "x", name: "", type: "timed", metricDirection: "lower_better" }))
      .toEqual({ error: "Name is required" });
  });
});
