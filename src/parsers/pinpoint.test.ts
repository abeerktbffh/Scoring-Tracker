import { describe, it, expect } from "vitest";
import { pinpointParser } from "./pinpoint";

const SAMPLE = `Pinpoint #793 | 3 guesses
1️⃣  | 33% match
2️⃣  | 3% match
3️⃣  | 100% match 📌
lnkd.in/pinpoint.`;

describe("pinpoint parser", () => {
  it("detects Pinpoint share text", () => {
    expect(pinpointParser.detect(SAMPLE)).toBe(true);
    expect(pinpointParser.detect("Queens #792\n0:31")).toBe(false);
  });

  it("parses guess count as the score, solved via 📌", () => {
    expect(pinpointParser.parse(SAMPLE)).toEqual({
      gameId: "pinpoint",
      puzzleNumber: 793,
      variant: null,
      value: 3,
      solved: true,
      detail: { guesses: 3, solved: true, trail: [33, 3, 100] },
    });
  });

  it("does not mistake the puzzle number or percentages for the guess count", () => {
    // #793 and 33%/100% must not be read as guesses; only 'N guesses' counts.
    expect(pinpointParser.parse(SAMPLE).value).toBe(3);
  });

  it("handles singular '1 guess'", () => {
    expect(pinpointParser.parse("Pinpoint #800 | 1 guess\n1️⃣ | 100% match 📌").value).toBe(1);
  });

  it("throws on non-Pinpoint text", () => {
    expect(() => pinpointParser.parse("Wordle 1,838 3/6")).toThrow();
  });
});

describe("pinpoint detail", () => {
  it("captures guesses, solved, and the %-match trail", () => {
    expect(pinpointParser.parse(SAMPLE).detail).toEqual({ guesses: 3, solved: true, trail: [33, 3, 100] });
    expect(pinpointParser.parse(SAMPLE).value).toBe(3);
  });
});
