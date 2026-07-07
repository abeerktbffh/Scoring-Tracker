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
    render(<LeaderboardTable rows={rows} me="Amy" leads="names" />);
    // Both rows show a medal glyph, so scope the assertion to DJ's row.
    const djRow = screen.getAllByText("DJ")[0].closest("tr");
    expect(djRow?.textContent).toMatch(/🥇3 🥈1 🥉0/);
    expect(djRow?.textContent).toContain("12"); // played
  });

  it("shows the Played header/column distinct from Medals (headers don't touch)", () => {
    render(<LeaderboardTable rows={rows} leads="names" />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("Medals");
    expect(headers).toContain("Played");
    // They're separate header cells, not concatenated into one.
    expect(headers).not.toContain("MedalsPlayed");
  });

  it("renders a crown for the #1 row and highlights the viewer's row", () => {
    render(<LeaderboardTable rows={rows} me="Amy" leads="names" />);
    // DJ is rank 1 (higher gold) and should get the crown icon (svg present).
    const djRow = screen.getAllByText("DJ")[0].closest("tr");
    expect(djRow?.querySelector("svg")).toBeTruthy();
  });

  it("renders a gap row and the viewer's true rank when they're outside the visible rows", () => {
    render(
      <LeaderboardTable
        rows={rows}
        me="Zed"
        leads="names"
        viewerRow={{ row: { displayName: "Zed", gold: 0, silver: 0, bronze: 0, gamesPlayed: 4, gamesLed: [] }, rank: 42 }}
      />
    );
    const zedRow = screen.getAllByText("Zed")[0].closest("tr");
    expect(zedRow?.textContent).toContain("42");
    expect(screen.getByText("⋯")).toBeTruthy(); // gap row divider
  });
});

describe("LeaderboardTable Leads line", () => {
  it("count mode: renders a plural count sub-line, nothing for 0 games led", () => {
    const threeLed: OverallRow[] = [
      { displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 12, gamesLed: ["wordle", "pips", "zip"] },
      { displayName: "Amy", gold: 1, silver: 2, bronze: 1, gamesPlayed: 9, gamesLed: [] },
    ];
    render(<LeaderboardTable rows={threeLed} leads="count" />);
    expect(screen.getByText("Leads 3 games")).toBeTruthy();
    expect(screen.queryByText(/wordle/i)).toBeNull();
  });

  it("count mode: singular for exactly 1 game led", () => {
    const oneLed: OverallRow[] = [
      { displayName: "DJ", gold: 1, silver: 0, bronze: 0, gamesPlayed: 5, gamesLed: ["wordle"] },
    ];
    render(<LeaderboardTable rows={oneLed} leads="count" />);
    expect(screen.getByText("Leads 1 game")).toBeTruthy();
  });

  it("names mode: renders real game names (not raw ids) joined together", () => {
    const led: OverallRow[] = [
      { displayName: "DJ", gold: 2, silver: 0, bronze: 0, gamesPlayed: 8, gamesLed: ["wordle", "connections"] },
    ];
    const gameNames = { wordle: "Wordle", connections: "Connections", zip: "Zip" };
    render(<LeaderboardTable rows={led} leads="names" gameNames={gameNames} />);
    expect(screen.getByText("Leads · Wordle, Connections")).toBeTruthy();
    expect(screen.queryByText(/wordle/)).toBeNull(); // raw lowercase id not shown
  });
});
