import { describe, it, expect } from "vitest";
import { minuteCrypticParser } from "./minuteCryptic";

const SAMPLE = `Minute Cryptic - 1 July, 2026
"Overly bright veils spurned by glum bride" (5)
🟣🟣🟣🟣🟣🟣🟣🟣
🏆 0 hints – 3 under the community par (40,185 solvers so far).
https://www.minutecryptic.com/?utm_source=share`;

describe("minute cryptic parser", () => {
  it("detects Minute Cryptic share text", () => {
    expect(minuteCrypticParser.detect(SAMPLE)).toBe(true);
    expect(minuteCrypticParser.detect("Wordle 1,838 3/6")).toBe(false);
  });
  it("parses hints used and marks solved, with no puzzle number", () => {
    expect(minuteCrypticParser.parse(SAMPLE)).toEqual({
      gameId: "minute-cryptic",
      puzzleNumber: null,
      variant: null,
      value: 0,
      solved: true,
    });
  });
  it("parses a non-zero hint count", () => {
    const r = minuteCrypticParser.parse(
      "Minute Cryptic - 2 July, 2026\n🏆 2 hints – at the community par",
    );
    expect(r.value).toBe(2);
    expect(r.solved).toBe(true);
  });
  it("throws on non-Minute-Cryptic text", () => {
    expect(() => minuteCrypticParser.parse("hello")).toThrow();
  });
});
