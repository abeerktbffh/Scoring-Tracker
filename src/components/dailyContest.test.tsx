// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DailyContestTable } from "@/components/DailyContestTable";
import { MedalBoardTable } from "@/components/MedalBoardTable";
import type { DailyContestRow, MedalBoardRow } from "@/lib/api";

afterEach(() => cleanup());

const wordleRow: DailyContestRow = {
  displayName: "DJ", value: 3, valueFormatted: "3/6 ✓", solved: true, medal: "gold", variant: null,
  detail: { guesses: 3, solved: true, hardMode: true, grid: ["⬛🟨⬛⬛⬛", "🟩🟩🟩🟩🟩"] },
};
const timedRow: DailyContestRow = {
  displayName: "Amy", value: 45, valueFormatted: "0:45", solved: true, medal: "silver", variant: null,
  detail: { seconds: 45, backtracks: 1 },
};
const noDetailRow: DailyContestRow = {
  displayName: "Zed", value: 4, valueFormatted: "4/6 ✓", solved: true, medal: null, detail: null, variant: null,
};
const connectionsRow: DailyContestRow = {
  displayName: "Sam", value: 1, valueFormatted: "1 mistake", solved: true, medal: "bronze", variant: null,
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
      displayName: "DJ", gold: 2, silver: 1, bronze: 0, gamesPlayed: 5,
    };
    render(<MedalBoardTable rows={[aggRow]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// Pips (and any future variant game) rank each difficulty as its own
// sub-contest on the Today board: a difficulty subheader + rank-reset per
// group, and an expand key that can't collide across groups even when the
// same player appears in more than one difficulty.
const pipsEasyAnn: DailyContestRow = {
  displayName: "Ann", value: 120, valueFormatted: "2:00", solved: true, medal: "gold", variant: "easy",
  detail: { seconds: 120, backtracks: 0 },
};
const pipsEasyBo: DailyContestRow = {
  displayName: "Bo", value: 180, valueFormatted: "3:00", solved: true, medal: "silver", variant: "easy",
  detail: { seconds: 180, backtracks: 1 },
};
const pipsHardAnn: DailyContestRow = {
  displayName: "Ann", value: 300, valueFormatted: "5:00", solved: true, medal: "gold", variant: "hard",
  detail: { seconds: 300, backtracks: 2 },
};
const pipsHardCy: DailyContestRow = {
  displayName: "Cy", value: 400, valueFormatted: "6:40", solved: true, medal: "silver", variant: "hard",
  detail: { seconds: 400, backtracks: 3 },
};

describe("DailyContestTable variant (Pips difficulty) grouping", () => {
  it("renders a per-group difficulty subheader and resets displayed rank at each group boundary", () => {
    render(<DailyContestTable rows={[pipsEasyAnn, pipsEasyBo, pipsHardAnn, pipsHardCy]} gameId="pips" />);

    expect(screen.getByText("Easy")).toBeTruthy();
    expect(screen.getByText("Hard")).toBeTruthy();

    const rankCells = screen.getAllByRole("row").map((row) => row.querySelector("td")?.textContent);
    // Header row has no rank cell (its first <td> doesn't exist -> undefined
    // is filtered out); each group's rank sequence restarts at 1.
    expect(rankCells.filter((t) => t === "1").length).toBe(2); // Ann-easy, Ann-hard
    expect(rankCells.filter((t) => t === "2").length).toBe(2); // Bo-easy, Cy-hard
  });

  it("orders variant groups as given (easy before hard) and keeps rows within a group in rank order", () => {
    render(<DailyContestTable rows={[pipsEasyAnn, pipsEasyBo, pipsHardAnn, pipsHardCy]} gameId="pips" />);
    const names = screen.getAllByText(/^(Ann|Bo|Cy)$/).map((el) => el.textContent);
    expect(names).toEqual(["Ann", "Bo", "Ann", "Cy"]);
  });

  it("lets a player appearing in two variant groups expand each independently — expanding one must not also expand the other", () => {
    render(<DailyContestTable rows={[pipsEasyAnn, pipsHardAnn]} gameId="pips" />);
    const [easyBtn, hardBtn] = screen.getAllByRole("button", { name: /details|expand/i });

    fireEvent.click(easyBtn);
    // Easy Ann's detail (0 backtracks) is visible; hard Ann's detail (2
    // backtracks) is NOT — proving the two same-named rows don't share
    // expand state via a bare displayName key.
    expect(screen.getByText(/0 backtracks/i)).toBeTruthy();
    expect(screen.queryByText(/2 backtracks/i)).toBeNull();

    fireEvent.click(easyBtn); // collapse easy
    fireEvent.click(hardBtn); // expand hard
    expect(screen.getByText(/2 backtracks/i)).toBeTruthy();
    expect(screen.queryByText(/0 backtracks/i)).toBeNull();
  });

  it("regression: a non-variant game (all variant: null) renders NO subheader and continuous ranks", () => {
    render(<DailyContestTable rows={[wordleRow, timedRow, connectionsRow]} gameId="wordle" />);
    expect(screen.queryByText("Easy")).toBeNull();
    expect(screen.queryByText("Hard")).toBeNull();

    const rankCells = screen.getAllByRole("row").map((row) => row.querySelector("td")?.textContent);
    expect(rankCells.filter((t) => t === "1").length).toBe(1);
    expect(rankCells.filter((t) => t === "2").length).toBe(1);
    expect(rankCells.filter((t) => t === "3").length).toBe(1);
  });
});
