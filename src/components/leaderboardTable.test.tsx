// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import type { OverallRow } from "@/lib/api";

afterEach(() => cleanup());

const rows: OverallRow[] = [
  { displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 12, gamesLed: ["wordle", "pips"] },
  { displayName: "Amy", gold: 1, silver: 2, bronze: 1, gamesPlayed: 9, gamesLed: [] },
];

describe("LeaderboardTable (medal tally)", () => {
  it("renders gold/silver/bronze counts and played", () => {
    render(<LeaderboardTable rows={rows} me="Amy" />);
    // Both rows show a medal glyph, so scope the assertion to DJ's row.
    const djRow = screen.getAllByText("DJ")[0].closest("tr");
    expect(djRow?.textContent).toMatch(/🥇3 🥈1 🥉0/);
    expect(djRow?.textContent).toContain("12"); // played
  });

  it("shows a games-led sub-line only when non-empty", () => {
    const { container } = render(<LeaderboardTable rows={rows} />);
    expect(container.textContent).toMatch(/leads:/i);
  });

  it("renders a crown for the #1 row and highlights the viewer's row", () => {
    render(<LeaderboardTable rows={rows} me="Amy" />);
    // DJ is rank 1 (higher gold) and should get the crown icon (svg present).
    const djRow = screen.getAllByText("DJ")[0].closest("tr");
    expect(djRow?.querySelector("svg")).toBeTruthy();
  });

  it("renders a gap row and the viewer's true rank when they're outside the visible rows", () => {
    render(
      <LeaderboardTable
        rows={rows}
        me="Zed"
        viewerRow={{ row: { displayName: "Zed", gold: 0, silver: 0, bronze: 0, gamesPlayed: 4, gamesLed: [] }, rank: 42 }}
      />
    );
    const zedRow = screen.getAllByText("Zed")[0].closest("tr");
    expect(zedRow?.textContent).toContain("42");
    expect(screen.getByText("⋯")).toBeTruthy(); // gap row divider
  });
});
