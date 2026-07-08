// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Standings from "@/app/(app)/standings/page";
import { getGames, getLeaderboard, getBoard } from "@/lib/api";
import { useBoard } from "@/components/BoardContext";
import type { Game, OverallRow, MedalBoardRow, DailyContestRow } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getGames: vi.fn(), getLeaderboard: vi.fn(), getBoard: vi.fn() }));
vi.mock("@/components/BoardContext", () => ({ useBoard: vi.fn() }));

const g = vi.mocked(getGames);
const lb = vi.mocked(getLeaderboard);
const bd = vi.mocked(getBoard);
const ub = vi.mocked(useBoard);

const games: Game[] = [{ id: "wordle", name: "Wordle", type: "outcome", metricDirection: "lower_better", hasVariants: false }];
const overall: OverallRow[] = [{ displayName: "DJ", gold: 3, silver: 1, bronze: 0, gamesPlayed: 10, gamesLed: ["wordle"] }];
const medalRows: MedalBoardRow[] = [{ displayName: "DJ", gold: 2, silver: 0, bronze: 1, gamesPlayed: 5 }];
const contestRows: DailyContestRow[] = [
  { displayName: "DJ", value: 2, valueFormatted: "2/6 ✓", solved: true, medal: "gold", detail: null, variant: null },
];

beforeEach(() => {
  g.mockReset(); lb.mockReset(); bd.mockReset(); ub.mockReset();
  g.mockResolvedValue({ ok: true, data: { games } });
  lb.mockResolvedValue({ ok: true, data: { window: "weekly", locked: false, players: overall, viewerName: "DJ" } });
  ub.mockReturnValue({ boardId: null, board: null, groups: [], loading: false, select: vi.fn(), refresh: vi.fn() });
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

  it("an aggregate window shows a flat medal board (no expandable rows, no PB column)", async () => {
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "weekly", mode: "aggregate", locked: false, players: medalRows, viewerName: "DJ" } });
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));

    await waitFor(() => expect(screen.getByText("5")).toBeTruthy()); // gamesPlayed
    // No PB column/header anywhere on the aggregate board
    expect(screen.queryByText("PB")).toBeNull();
    // No expand chevrons on aggregate rows
    expect(screen.queryByRole("button", { name: /expand|details/i })).toBeNull();
  });

  it("no-peek: a locked daily board shows LockedState instead of the contest table", async () => {
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "daily", mode: "daily", locked: true, players: [], viewerName: "DJ" } });
    render(<Standings />);
    await waitFor(() => expect(screen.getAllByText("DJ").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));
    fireEvent.click(screen.getByRole("button", { name: /window/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Today$/ }));

    await waitFor(() =>
      expect(screen.getByText(/log today's puzzle to reveal today's standings/i)).toBeTruthy()
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("row")).toBeNull();
  });

  it("group scoping: threads the selected boardId into getGames/getLeaderboard/getBoard", async () => {
    ub.mockReturnValue({ boardId: "g1", board: null, groups: [], loading: false, select: vi.fn(), refresh: vi.fn() });
    bd.mockResolvedValue({ ok: true, data: { gameId: "wordle", window: "weekly", mode: "aggregate", locked: false, players: medalRows, viewerName: "DJ" } });
    render(<Standings />);

    await waitFor(() => expect(g).toHaveBeenCalledWith("g1"));
    await waitFor(() => expect(lb).toHaveBeenCalledWith("weekly", undefined, "g1"));

    fireEvent.click(screen.getByRole("button", { name: /game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Wordle$/ }));

    await waitFor(() => expect(bd).toHaveBeenCalledWith("wordle", "weekly", undefined, "g1"));
  });
});
