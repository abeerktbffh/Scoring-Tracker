import { describe, it, expect } from "vitest";
import { PLATFORM_TZ } from "./group";

describe("PLATFORM_TZ", () => {
  it("is the platform timezone", () => {
    expect(PLATFORM_TZ).toBe("Asia/Kolkata");
  });
});
