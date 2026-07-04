import { describe, it, expect } from "vitest";
import { normalizeError } from "./api";

describe("normalizeError", () => {
  it("maps known statuses to friendly copy", () => {
    expect(normalizeError(401, {})).toMatch(/sign in|passphrase/i);
    expect(normalizeError(422, { error: "Could not parse result" })).toBe("Could not parse result");
    expect(normalizeError(500, {})).toMatch(/something went wrong/i);
  });

  it("prefers body.error when present, regardless of status", () => {
    expect(normalizeError(403, { error: "Custom message" })).toBe("Custom message");
  });

  it("maps 403 to an access-denied message when no body.error is given", () => {
    expect(normalizeError(403, {})).toBe("You don't have access to this.");
  });

  it("maps 401 to a sign-in message when no body.error is given", () => {
    expect(normalizeError(401, {})).toBe("Please sign in again.");
  });

  it("maps 422 to a parse-format message when no body.error is given", () => {
    expect(normalizeError(422, {})).toBe("Couldn't read that — check the format.");
  });

  it("maps unknown statuses to a generic message", () => {
    expect(normalizeError(500, {})).toBe("Something went wrong — try again.");
    expect(normalizeError(0, undefined)).toBe("Something went wrong — try again.");
  });
});
