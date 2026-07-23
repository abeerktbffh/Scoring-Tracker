import { describe, expect, it } from "vitest";
import { formatPendingGames } from "./pendingGames";

describe("formatPendingGames", () => {
  it("lists the names of games not yet logged", () => {
    const games = [
      { name: "Wordle", logged: true },
      { name: "Pips", logged: false },
      { name: "Zip", logged: false },
    ];
    expect(formatPendingGames(games)).toBe("Still to play: Pips · Zip");
  });

  it("returns a celebratory line when all games are logged", () => {
    const games = [
      { name: "Wordle", logged: true },
      { name: "Pips", logged: true },
    ];
    expect(formatPendingGames(games)).toBe("All done today 🎉");
  });

  it("returns a celebratory line for an empty list", () => {
    expect(formatPendingGames([])).toBe("All done today 🎉");
  });
});
