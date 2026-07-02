import { describe, it, expect } from "vitest";
import { filterAndOrderGames } from "./gameFilter";

interface Game {
  id: string;
  name: string;
}

const games: Game[] = [
  { id: "connections", name: "Connections" },
  { id: "mini", name: "NYT Mini" },
  { id: "crossclimb", name: "Crossclimb" },
  { id: "minute-cryptic", name: "Minute Cryptic" },
  { id: "pinpoint", name: "Pinpoint" },
];

describe("filterAndOrderGames", () => {
  it("splits games into due (today, unplayed) and rest", () => {
    const result = filterAndOrderGames(games, "", ["mini", "connections"]);

    expect(result.due.map((g) => g.id)).toEqual(["connections", "mini"]);
    expect(result.rest.map((g) => g.id)).toEqual(["crossclimb", "minute-cryptic", "pinpoint"]);
  });

  it("orders due games by name", () => {
    const result = filterAndOrderGames(games, "", ["mini", "connections"]);

    expect(result.due.map((g) => g.name)).toEqual(["Connections", "NYT Mini"]);
  });

  it("orders rest games by name", () => {
    const result = filterAndOrderGames(games, "", []);

    expect(result.rest.map((g) => g.name)).toEqual([
      "Connections",
      "Crossclimb",
      "Minute Cryptic",
      "NYT Mini",
      "Pinpoint",
    ]);
  });

  it("filters both due and rest by case-insensitive substring match on name", () => {
    const result = filterAndOrderGames(games, "min", ["mini"]);

    expect(result.due.map((g) => g.id)).toEqual(["mini"]);
    expect(result.rest.map((g) => g.id)).toEqual(["minute-cryptic"]);
  });

  it("matches query regardless of case", () => {
    const result = filterAndOrderGames(games, "MINI", ["mini"]);

    expect(result.due.map((g) => g.id)).toEqual(["mini"]);
    expect(result.rest.map((g) => g.id)).toEqual([]);
  });

  it("empty query returns all games split correctly", () => {
    const result = filterAndOrderGames(games, "", ["pinpoint"]);

    expect(result.due.map((g) => g.id)).toEqual(["pinpoint"]);
    expect(result.rest.map((g) => g.id)).toEqual([
      "connections",
      "crossclimb",
      "minute-cryptic",
      "mini",
    ]);
  });

  it("returns empty due/rest when query matches nothing", () => {
    const result = filterAndOrderGames(games, "zzz", ["mini"]);

    expect(result.due).toEqual([]);
    expect(result.rest).toEqual([]);
  });

  it("does not mutate the input games array", () => {
    const original = [...games];
    filterAndOrderGames(games, "e", ["mini", "connections"]);

    expect(games).toEqual(original);
    expect(games[0]).toBe(original[0]);
  });

  it("does not mutate the dueTodayIds array", () => {
    const dueTodayIds = ["mini", "connections"];
    const originalDueIds = [...dueTodayIds];
    filterAndOrderGames(games, "", dueTodayIds);

    expect(dueTodayIds).toEqual(originalDueIds);
  });

  it("treats a game id in dueTodayIds but absent from games as a no-op (no crash)", () => {
    const result = filterAndOrderGames(games, "", ["not-a-real-id"]);

    expect(result.due).toEqual([]);
    expect(result.rest.map((g) => g.id)).toEqual([
      "connections",
      "crossclimb",
      "minute-cryptic",
      "mini",
      "pinpoint",
    ]);
  });
});
