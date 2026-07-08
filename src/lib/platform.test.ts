import { describe, it, expect } from "vitest";
import { detectPlatform } from "./platform";

describe("detectPlatform", () => {
  it("detects iOS (iPhone/iPad)", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
  });
  it("detects Android", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel)")).toBe("android");
  });
  it("falls back to other for desktop", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe("other");
  });
});
