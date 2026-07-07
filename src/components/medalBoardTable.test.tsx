// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MedalBoardTable } from "@/components/MedalBoardTable";
import type { MedalBoardRow } from "@/lib/api";

afterEach(() => cleanup());

const rows: MedalBoardRow[] = [
  { displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 12 },
  { displayName: "Amy", gold: 1, silver: 2, bronze: 1, gamesPlayed: 9 },
];

describe("MedalBoardTable", () => {
  it("has no PB column anywhere (header or cells)", () => {
    render(<MedalBoardTable rows={rows} />);
    expect(screen.queryByText("PB")).toBeNull();
  });

  it("columns are: Player, Medals, Played (rank is unlabeled)", () => {
    render(<MedalBoardTable rows={rows} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["", "Player", "Medals", "Played"]);
  });

  it("renders medal counts and gamesPlayed, with Medals/Played as distinct cells", () => {
    render(<MedalBoardTable rows={rows} />);
    const djRow = screen.getByText("DJ").closest("tr");
    expect(djRow?.textContent).toMatch(/🥇3 🥈1 🥉0/);
    // Medals and Played render as separate cells, not concatenated.
    const cells = djRow ? Array.from(djRow.querySelectorAll("td")).map((c) => c.textContent) : [];
    expect(cells).toEqual(["1", "DJ", "🥇3 🥈1 🥉0", "12"]);
  });

  it("highlights the viewer's row", () => {
    render(<MedalBoardTable rows={rows} me="Amy" />);
    const amyRow = screen.getByText("Amy").closest("tr");
    expect(amyRow?.className).toMatch(/me/i);
  });
});
