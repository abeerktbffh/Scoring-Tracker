import { describe, it, expect } from "vitest";
import { gameUrl, GAME_URLS } from "./gameLinks";

describe("gameUrl", () => {
  it("returns the mapped URL for a known game", () => {
    expect(gameUrl("wordle")).toBe("https://www.nytimes.com/games/wordle/index.html");
    expect(gameUrl("hindu-mini")).toBe("https://www.thehindu.com/crosswords/thehindu-mini-crossword/");
  });
  it("returns null for an unmapped game", () => {
    expect(gameUrl("nyt-mini")).toBeNull();
    expect(gameUrl("totally-unknown")).toBeNull();
  });
  it("every mapped URL is https", () => {
    for (const u of Object.values(GAME_URLS)) expect(u.startsWith("https://")).toBe(true);
  });
});
