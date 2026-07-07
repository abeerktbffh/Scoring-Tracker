import { describe, it, expect } from "vitest";
import { sortByMedals } from "./leaderboardSort";
import type { OverallRow } from "./api";

const row = (displayName: string, gold: number, silver: number, bronze: number): OverallRow => ({
  displayName, gold, silver, bronze, gamesPlayed: gold + silver + bronze, gamesLed: [],
});

describe("sortByMedals", () => {
  it("sorts by gold, then silver, then bronze, then name; pure (no mutation)", () => {
    const input = [row("Zed", 1, 0, 0), row("Amy", 2, 0, 0), row("Bob", 1, 1, 0), row("Cara", 1, 0, 5)];
    const sorted = sortByMedals(input);
    expect(sorted.map((r) => r.displayName)).toEqual(["Amy", "Bob", "Cara", "Zed"]);
    expect(input[0].displayName).toBe("Zed"); // input unchanged
  });
});
