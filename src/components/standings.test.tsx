// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Standings from "@/app/(app)/standings/page";
import { getGames, getLeaderboard, getBoard } from "@/lib/api";
import type { Game, OverallRow, MedalBoardRow, DailyContestRow } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getGames: vi.fn(), getLeaderboard: vi.fn(), getBoard: vi.fn() }));
vi.mock("@/components/BoardContext", () => ({ useBoard: () => ({ boardId: null }) }));

const g = vi.mocked(getGames);
const lb = vi.mocked(getLeaderboard);
const bd = vi.mocked(getBoard);

const games: Game[] = [{ id: "wordle", name: "Wordle", type: "outcome", metricDirection: "lower_better", hasVariants: false }];
const overall: OverallRow[] = [{ displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 10, gamesLed: ["wordle"] }];
const medalRows: MedalBoardRow[] = [{ displayName: "DJ", gold: 2, silver: 0, bronze: 1, gamesPlayed: 5, pb: 2, pbFormatted: "2/6 ✓" }];
const contestRows: DailyContestRow[] = [
  { displayName: "DJ", value: 2, valueFormatted: "2/6 ✓", solved: true, medal: "gold", detail: null },
];

beforeEach(() => {
  g.mockReset(); lb.mockReset(); bd.mockReset();
  g.mockResolvedValue({ ok: true, data: { games } });
  lb.mockResolvedValue({ ok: true, data: { window: "weekly", locked: false, players: overall, viewerName: "DJ" } });
});
afterEach(() => cleanup());

describe("Standings board screen", () => {
  it("shows Overall medal tally by default", async () => {
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));
    // Overall shows gold/silver/bronze counts
    expect(screen.getByText(/🥇/)).toBeTruthy();
  });

  it("switching Game ▾ to a game + Today shows the daily contest with proper units and a medal", async () => {
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "daily", mode: "daily", locked: false, players: contestRows, viewerName: "DJ" } });
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));
    fireEvent.click(screen.getByRole("button", { name: /window/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Today$/ }));

    await waitFor(() => expect(screen.getByText("2/6 ✓")).toBeTruthy());
    expect(screen.getByText(/🥇/)).toBeTruthy();
  });

  it("an aggregate window shows a flat medal board (no expandable rows) with PB in units", async () => {
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "weekly", mode: "aggregate", locked: false, players: medalRows, viewerName: "DJ" } });
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));

    await waitFor(() => expect(screen.getByText("2/6 ✓")).toBeTruthy()); // PB formatted
    // No expand chevrons on aggregate rows
    expect(screen.queryByRole("button", { name: /expand|details/i })).toBeNull();
  });
});
