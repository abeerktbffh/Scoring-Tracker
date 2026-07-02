import { describe, it, expect } from "vitest";
import { sortPlayers } from "./leaderboardSort";
import type { OverallRow } from "./api";

const rows: OverallRow[] = [
  { displayName: "Alice", wins: 5, gamesPlayed: 10, winRate: 0.5 },
  { displayName: "Bob", wins: 8, gamesPlayed: 12, winRate: 0.67 },
  { displayName: "Cara", wins: 8, gamesPlayed: 9, winRate: 0.89 },
];

describe("sortPlayers", () => {
  it("sorts descending by wins", () => {
    const sorted = sortPlayers(rows, "wins");
    expect(sorted.map((r) => r.displayName)).toEqual(["Bob", "Cara", "Alice"]);
  });

  it("sorts descending by gamesPlayed", () => {
    const sorted = sortPlayers(rows, "gamesPlayed");
    expect(sorted.map((r) => r.displayName)).toEqual(["Bob", "Alice", "Cara"]);
  });

  it("sorts descending by winRate", () => {
    const sorted = sortPlayers(rows, "winRate");
    expect(sorted.map((r) => r.displayName)).toEqual(["Cara", "Bob", "Alice"]);
  });

  it("is stable for ties (equal keys keep input order)", () => {
    const tied: OverallRow[] = [
      { displayName: "First", wins: 8, gamesPlayed: 10, winRate: 0.5 },
      { displayName: "Second", wins: 8, gamesPlayed: 10, winRate: 0.5 },
      { displayName: "Third", wins: 8, gamesPlayed: 10, winRate: 0.5 },
    ];
    const sorted = sortPlayers(tied, "wins");
    expect(sorted.map((r) => r.displayName)).toEqual(["First", "Second", "Third"]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortPlayers(rows, "wins");
    expect(rows).toEqual(original);
    expect(rows[0]).toBe(original[0]);
    expect(rows[1]).toBe(original[1]);
    expect(rows[2]).toBe(original[2]);
  });

  it("returns a new array (not the same reference)", () => {
    const sorted = sortPlayers(rows, "wins");
    expect(sorted).not.toBe(rows);
  });
});
