// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Admin from "@/app/(app)/admin/page";
import { getPlayers, postAdminGame, renamePlayer } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import type { Player } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getPlayers: vi.fn(),
  postAdminGame: vi.fn(),
  renamePlayer: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  loadName: vi.fn(),
}));

const mockedGetPlayers = vi.mocked(getPlayers);
const mockedPostAdminGame = vi.mocked(postAdminGame);
const mockedRenamePlayer = vi.mocked(renamePlayer);
const mockedLoadName = vi.mocked(loadName);

const players: Player[] = [
  { id: "p1", displayName: "DJ" },
  { id: "p2", displayName: "Devanshi" },
];

beforeEach(() => {
  mockedGetPlayers.mockReset();
  mockedPostAdminGame.mockReset();
  mockedRenamePlayer.mockReset();
  mockedLoadName.mockReset();

  mockedLoadName.mockReturnValue("You");
  mockedGetPlayers.mockResolvedValue({ ok: true, data: { players } });
});

afterEach(() => {
  cleanup();
});

describe("Admin", () => {
  it("renders the players list from getPlayers", async () => {
    render(<Admin />);

    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());
    expect(screen.getByDisplayValue("Devanshi")).toBeTruthy();
  });

  it("submits the admin passphrase and new game fields to postAdminGame", async () => {
    mockedPostAdminGame.mockResolvedValue({
      ok: true,
      data: { game: { id: "pips", name: "Pips", type: "timed", metricDirection: "lower_better", hasVariants: true } },
    });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/admin passphrase/i), { target: { value: "let-me-in" } });
    fireEvent.change(screen.getByLabelText(/^game id$/i), { target: { value: "pips" } });
    fireEvent.change(screen.getByLabelText(/^game name$/i), { target: { value: "Pips" } });
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "timed" } });
    fireEvent.change(screen.getByLabelText(/metric direction/i), { target: { value: "lower_better" } });
    fireEvent.click(screen.getByLabelText(/has variants/i));
    fireEvent.change(screen.getByLabelText(/parser id/i), { target: { value: "pips-parser" } });

    fireEvent.click(screen.getByRole("button", { name: /add game/i }));

    await waitFor(() =>
      expect(mockedPostAdminGame).toHaveBeenCalledWith("let-me-in", {
        id: "pips",
        name: "Pips",
        type: "timed",
        metricDirection: "lower_better",
        hasVariants: true,
        parserId: "pips-parser",
      })
    );

    await waitFor(() => expect(screen.getByText(/added/i)).toBeTruthy());
  });

  it("surfaces the error when postAdminGame fails", async () => {
    mockedPostAdminGame.mockResolvedValue({ ok: false, error: "Wrong passphrase.", status: 401 });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/admin passphrase/i), { target: { value: "nope" } });
    fireEvent.change(screen.getByLabelText(/^game id$/i), { target: { value: "pips" } });
    fireEvent.change(screen.getByLabelText(/^game name$/i), { target: { value: "Pips" } });

    fireEvent.click(screen.getByRole("button", { name: /add game/i }));

    await waitFor(() => expect(screen.getByText("Wrong passphrase.")).toBeTruthy());
  });

  it("edits a player's name and calls renamePlayer with the passphrase, id, and new name", async () => {
    mockedRenamePlayer.mockResolvedValue({ ok: true, data: { ok: true } });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/admin passphrase/i), { target: { value: "let-me-in" } });

    const nameInput = screen.getByDisplayValue("DJ");
    fireEvent.change(nameInput, { target: { value: "DJ Renamed" } });

    fireEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]);

    await waitFor(() =>
      expect(mockedRenamePlayer).toHaveBeenCalledWith("let-me-in", "p1", "DJ Renamed")
    );
  });
});
