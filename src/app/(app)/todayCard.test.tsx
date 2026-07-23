// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TodayCard } from "./TodayCard";

afterEach(cleanup);

const detail: import("@/scoring/todayDetail").TodayGameDetail[] = [
  { gameId: "wordle", name: "Wordle", variant: null, played: true, valueFormatted: "3/6 ✓", solved: true, rank: 2, playerCount: 6 },
  { gameId: "nyt-mini", name: "NYT Mini", variant: null, played: false, valueFormatted: null, solved: false, rank: null, playerCount: 0 },
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
  it("pressing Enter on the card toggles it open", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    const card = screen.getByRole("button", { name: /today/i });
    expect(screen.queryByText("Wordle")).toBeNull();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByText("Wordle")).toBeTruthy();
  });
  it("pressing Space on the card toggles it open", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    const card = screen.getByRole("button", { name: /today/i });
    expect(screen.queryByText("Wordle")).toBeNull();
    fireEvent.keyDown(card, { key: " " });
    expect(screen.getByText("Wordle")).toBeTruthy();
  });
  it("clicking the play-link anchor does not toggle the card", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    // Expand once so the play link is present, then collapse and verify a
    // click on the link (bubbling up to the card's onClick) doesn't re-open it.
    const card = screen.getByRole("button", { name: /today/i });
    fireEvent.click(card);
    expect(card.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(card); // collapse
    expect(card.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: /open wordle/i })).toBeNull();

    // Re-expand to access the link, then confirm clicking the link itself
    // never toggles (guarded by handleClick's closest("a") check).
    fireEvent.click(card);
    expect(card.getAttribute("aria-expanded")).toBe("true");
    const play = screen.getByRole("link", { name: /open wordle/i });
    fireEvent.click(play);
    expect(card.getAttribute("aria-expanded")).toBe("true"); // unchanged, click was absorbed
  });
  it("pressing Enter on the play-link anchor does not toggle the card", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={detail} />);
    const card = screen.getByRole("button", { name: /today/i });
    fireEvent.click(card); // expand to reveal the play link
    expect(card.getAttribute("aria-expanded")).toBe("true");
    const play = screen.getByRole("link", { name: /open wordle/i });
    fireEvent.keyDown(play, { key: "Enter" });
    expect(card.getAttribute("aria-expanded")).toBe("true"); // unchanged — link handles its own activation
  });
  it("labels a variant row with its difficulty", () => {
    render(<TodayCard loggedCount={3} totalCount={6} games={[]} streak={4} todayDetail={[
      { gameId: "pips", name: "Pips", variant: "easy", played: true, valueFormatted: "1:12", solved: true, rank: 1, playerCount: 3 },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(screen.getByText(/Pips.*Easy/i)).toBeTruthy();
  });
});
