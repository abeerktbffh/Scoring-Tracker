import { describe, it, expect } from "vitest";
import { summarize } from "./backfillVerify";

describe("summarize", () => {
  it("flags case-insensitive display-name collisions", () => {
    const result = summarize({
      nameCollisionRows: [{ n: "abeer", c: 2 }],
      entriesMissingUserIdRows: [{ c: 0 }],
      usersMissingNameRows: [{ c: 0 }],
    });

    expect(result.nameCollisions).toEqual([{ n: "abeer", c: 2 }]);
    expect(result.ok).toBe(false);
  });

  it("flags entries missing a backfilled user_id", () => {
    const result = summarize({
      nameCollisionRows: [],
      entriesMissingUserIdRows: [{ c: 3 }],
      usersMissingNameRows: [{ c: 0 }],
    });

    expect(result.entriesMissingUserId).toBe(3);
    expect(result.ok).toBe(false);
  });

  it("reports users still missing a display name without failing the gate", () => {
    const result = summarize({
      nameCollisionRows: [],
      entriesMissingUserIdRows: [{ c: 0 }],
      usersMissingNameRows: [{ c: 1 }],
    });

    expect(result.usersMissingName).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("passes clean input", () => {
    const result = summarize({
      nameCollisionRows: [],
      entriesMissingUserIdRows: [{ c: 0 }],
      usersMissingNameRows: [{ c: 0 }],
    });

    expect(result).toEqual({
      ok: true,
      nameCollisions: [],
      entriesMissingUserId: 0,
      usersMissingName: 0,
    });
  });
});
