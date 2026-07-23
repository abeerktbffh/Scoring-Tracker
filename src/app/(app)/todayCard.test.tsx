// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TodayCard } from "./TodayCard";

afterEach(cleanup);

const detail = [
  { gameId: "wordle", name: "Wordle", played: true, valueFormatted: "3/6 ✓", solved: true, rank: 2, playerCount: 6 },
  { gameId: "nyt-mini", name: "NYT Mini", played: false, valueFormatted: null, solved: false, rank: null, playerCount: 0 },
];

describe("TodayCard", () => {
  it("collapsed by default; expands on click to show per-game rows", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    expect(screen.queryByText(/3\/6/)).toBeNull(); // panel hidden until expanded
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(screen.getByText("Wordle")).toBeTruthy();
    expect(screen.getByText(/3\/6/)).toBeTruthy();
    expect(screen.getByText(/2.{0,3} of 6/)).toBeTruthy(); // "2nd of 6"
  });
  it("play icon links to the game URL (new tab) only when a URL exists", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    const play = screen.getByRole("link", { name: /open wordle/i });
    expect(play.getAttribute("href")).toBe("https://www.nytimes.com/games/wordle/index.html");
    expect(play.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("link", { name: /open nyt mini/i })).toBeNull(); // nyt-mini has no URL
  });
  it("not-played row shows the fallback", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(screen.getByText(/not played today/i)).toBeTruthy();
  });
});
