// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Admin from "@/app/(app)/admin/page";
import {
  getPlayers,
  postAdminGame,
  renamePlayer,
  getPendingClaims,
  decideClaim,
  createInvite,
} from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import type { Player } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getPlayers: vi.fn(),
  postAdminGame: vi.fn(),
  renamePlayer: vi.fn(),
  getPendingClaims: vi.fn(),
  decideClaim: vi.fn(),
  createInvite: vi.fn(),
}));

vi.mock("@/lib/rememberMe", () => ({
  loadName: vi.fn(),
}));

const mockedGetPlayers = vi.mocked(getPlayers);
const mockedPostAdminGame = vi.mocked(postAdminGame);
const mockedRenamePlayer = vi.mocked(renamePlayer);
const mockedGetPendingClaims = vi.mocked(getPendingClaims);
const mockedDecideClaim = vi.mocked(decideClaim);
const mockedCreateInvite = vi.mocked(createInvite);
const mockedLoadName = vi.mocked(loadName);

const players: Player[] = [
  { id: "p1", displayName: "DJ" },
  { id: "p2", displayName: "Devanshi" },
];

beforeEach(() => {
  mockedGetPlayers.mockReset();
  mockedPostAdminGame.mockReset();
  mockedRenamePlayer.mockReset();
  mockedGetPendingClaims.mockReset();
  mockedDecideClaim.mockReset();
  mockedCreateInvite.mockReset();
  mockedLoadName.mockReset();

  mockedLoadName.mockReturnValue("You");
  mockedGetPlayers.mockResolvedValue({ ok: true, data: { players } });
  mockedGetPendingClaims.mockResolvedValue({ ok: true, data: { claims: [] } });
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

  it("does not render an admin passphrase field", async () => {
    render(<Admin />);

    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());
    expect(screen.queryByLabelText(/admin passphrase/i)).toBeNull();
  });

  it("submits the new game fields to postAdminGame without a passphrase", async () => {
    mockedPostAdminGame.mockResolvedValue({
      ok: true,
      data: { game: { id: "pips", name: "Pips", type: "timed", metricDirection: "lower_better", hasVariants: true } },
    });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/^game id$/i), { target: { value: "pips" } });
    fireEvent.change(screen.getByLabelText(/^game name$/i), { target: { value: "Pips" } });
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "timed" } });
    fireEvent.change(screen.getByLabelText(/metric direction/i), { target: { value: "lower_better" } });
    fireEvent.click(screen.getByLabelText(/has variants/i));
    fireEvent.change(screen.getByLabelText(/parser id/i), { target: { value: "pips-parser" } });

    fireEvent.click(screen.getByRole("button", { name: /add game/i }));

    await waitFor(() =>
      expect(mockedPostAdminGame).toHaveBeenCalledWith({
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
    mockedPostAdminGame.mockResolvedValue({ ok: false, error: "Not allowed.", status: 403 });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/^game id$/i), { target: { value: "pips" } });
    fireEvent.change(screen.getByLabelText(/^game name$/i), { target: { value: "Pips" } });

    fireEvent.click(screen.getByRole("button", { name: /add game/i }));

    await waitFor(() => expect(screen.getByText("Not allowed.")).toBeTruthy());
  });

  it("edits a player's name and calls renamePlayer with the id and new name (no passphrase)", async () => {
    mockedRenamePlayer.mockResolvedValue({ ok: true, data: { ok: true } });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    const nameInput = screen.getByDisplayValue("DJ");
    fireEvent.change(nameInput, { target: { value: "DJ Renamed" } });

    fireEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]);

    await waitFor(() =>
      expect(mockedRenamePlayer).toHaveBeenCalledWith("p1", "DJ Renamed")
    );
  });

  it("hides the pending claims section when there are no pending claims", async () => {
    mockedGetPendingClaims.mockResolvedValue({ ok: true, data: { claims: [] } });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    expect(screen.queryByText(/pending claims/i)).toBeNull();
  });

  it("renders pending claims (player name + claimant email) and approves on click", async () => {
    mockedGetPendingClaims.mockResolvedValue({
      ok: true,
      data: {
        claims: [
          {
            id: "claim1",
            playerId: "p1",
            playerDisplayName: "DJ",
            claimedByUserId: "u1",
            claimedByEmail: "dj@example.com",
            claimedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    mockedDecideClaim.mockResolvedValue({ ok: true, data: { ok: true } });

    render(<Admin />);

    await waitFor(() => expect(screen.getByText(/pending claims/i)).toBeTruthy());
    expect(screen.getByText("DJ")).toBeTruthy();
    expect(screen.getByText("dj@example.com")).toBeTruthy();

    // list refreshes to empty after approval, so the section self-retires
    mockedGetPendingClaims.mockResolvedValue({ ok: true, data: { claims: [] } });

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() =>
      expect(mockedDecideClaim).toHaveBeenCalledWith("claim1", "approve")
    );
    await waitFor(() => expect(screen.queryByText(/pending claims/i)).toBeNull());
  });

  it("rejects a claim with the reject decision", async () => {
    mockedGetPendingClaims.mockResolvedValue({
      ok: true,
      data: {
        claims: [
          {
            id: "claim1",
            playerId: "p1",
            playerDisplayName: "DJ",
            claimedByUserId: "u1",
            claimedByEmail: "dj@example.com",
            claimedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    mockedDecideClaim.mockResolvedValue({ ok: true, data: { ok: true } });

    render(<Admin />);
    await waitFor(() => expect(screen.getByText(/pending claims/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() =>
      expect(mockedDecideClaim).toHaveBeenCalledWith("claim1", "reject")
    );
  });

  it("generates an invite link and shows it once with a copy affordance", async () => {
    mockedCreateInvite.mockResolvedValue({
      ok: true,
      data: { token: "tok123", link: "https://example.com/onboarding?invite=tok123" },
    });

    render(<Admin />);
    await waitFor(() => expect(screen.getByDisplayValue("DJ")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /generate invite/i }));

    await waitFor(() =>
      expect(screen.getByText("https://example.com/onboarding?invite=tok123")).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });
});
