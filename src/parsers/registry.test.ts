import { describe, it, expect } from "vitest";
import { detectAndParse } from "./registry";

describe("detectAndParse", () => {
  it("routes Wordle text to the Wordle parser", () => {
    const r = detectAndParse("Wordle 1,234 3/6");
    expect(r?.gameId).toBe("wordle");
    expect(r?.value).toBe(3);
  });

  it("returns null when no parser matches", () => {
    expect(detectAndParse("random text nobody parses")).toBeNull();
  });

  it("returns null when a matching parser's parse() throws", () => {
    const boom = {
      gameId: "boom",
      detect: () => true,
      parse: () => {
        throw new Error("boom");
      },
    };
    expect(detectAndParse("anything", [boom])).toBeNull();
  });
});
