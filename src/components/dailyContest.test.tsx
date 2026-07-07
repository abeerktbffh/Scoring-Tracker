// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DailyContestTable } from "@/components/DailyContestTable";
import { MedalBoardTable } from "@/components/MedalBoardTable";
import type { DailyContestRow, MedalBoardRow } from "@/lib/api";

afterEach(() => cleanup());

const wordleRow: DailyContestRow = {
  displayName: "DJ", value: 3, valueFormatted: "3/6 ✓", solved: true, medal: "gold",
  detail: { guesses: 3, solved: true, hardMode: true, grid: ["⬛🟨⬛⬛⬛", "🟩🟩🟩🟩🟩"] },
};
const timedRow: DailyContestRow = {
  displayName: "Amy", value: 45, valueFormatted: "0:45", solved: true, medal: "silver",
  detail: { seconds: 45, backtracks: 1 },
};
const noDetailRow: DailyContestRow = {
  displayName: "Zed", value: 4, valueFormatted: "4/6 ✓", solved: true, medal: null, detail: null,
};
const connectionsRow: DailyContestRow = {
  displayName: "Sam", value: 1, valueFormatted: "1 mistake", solved: true, medal: "bronze",
  detail: {
    mistakes: 1,
    solvedAll: true,
    grid: ["🟩🟦🟪🟨", "🟩🟩🟩🟩", "🟦🟦🟦🟦", "🟪🟪🟪🟪"],
  },
};

describe("DailyContestTable expansion (today-only)", () => {
  it("expands a Wordle row to stat pills + the verbatim grid on tap", () => {
    render(<DailyContestTable rows={[wordleRow]} gameId="wordle" />);
    fireEvent.click(screen.getByRole("button", { name: /details|expand/i }));
    expect(screen.getByText(/hard mode/i)).toBeTruthy();
    expect(screen.getByText("🟩🟩🟩🟩🟩")).toBeTruthy();
  });

  it("expands a timed row to pills only (no grid)", () => {
    render(<DailyContestTable rows={[timedRow]} gameId="zip" />);
    fireEvent.click(screen.getByRole("button", { name: /details|expand/i }));
    expect(screen.getByText(/backtrack/i)).toBeTruthy();
    expect(screen.queryByText(/🟩/)).toBeNull();
  });

  it("does not render an expand control for rows without detail", () => {
    render(<DailyContestTable rows={[noDetailRow]} gameId="wordle" />);
    expect(screen.queryByRole("button", { name: /details|expand/i })).toBeNull();
  });

  it("keeps the collapsed row minimal — no pills or grid text before the tap", () => {
    render(<DailyContestTable rows={[wordleRow]} gameId="wordle" />);
    expect(screen.queryByText(/hard mode/i)).toBeNull();
    expect(screen.queryByText("🟩🟩🟩🟩🟩")).toBeNull();
    // Collapsed row shows only rank · name · medal+value · chevron control.
    expect(screen.getByText("DJ")).toBeTruthy();
    expect(screen.getByText("3/6 ✓")).toBeTruthy();
  });

  it("dims Connections mistake rows in the grid and shows solved rows undimmed", () => {
    render(<DailyContestTable rows={[connectionsRow]} gameId="connections" />);
    fireEvent.click(screen.getByRole("button", { name: /details|expand/i }));
    const dimmedRow = screen.getByText("🟩🟦🟪🟨");
    const cleanRow = screen.getByText("🟩🟩🟩🟩");
    expect(dimmedRow.className).toMatch(/dim/i);
    expect(cleanRow.className).not.toMatch(/dim/i);
  });

  it("never expands aggregate (Week/Month/All-time) rows — MedalBoardTable stays flat", () => {
    const aggRow: MedalBoardRow = {
      displayName: "DJ", gold: 2, silver: 1, bronze: 0, gamesPlayed: 5, pb: 3, pbFormatted: "3/6 ✓",
    };
    render(<MedalBoardTable rows={[aggRow]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
