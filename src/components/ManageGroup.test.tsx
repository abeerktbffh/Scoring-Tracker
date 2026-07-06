// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ManageGroup } from "./ManageGroup";
import {
  getGames,
  getGroupMembers,
  renameGroup,
  setGroupGames,
  removeMember,
  resetGroupInvite,
  deleteGroup,
} from "@/lib/api";
import { useBoard } from "@/components/BoardContext";
import type { Game } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGames: vi.fn(),
  getGroupMembers: vi.fn(),
  renameGroup: vi.fn(),
  setGroupGames: vi.fn(),
  removeMember: vi.fn(),
  resetGroupInvite: vi.fn(),
  deleteGroup: vi.fn(),
}));

vi.mock("@/components/BoardContext", () => ({
  useBoard: vi.fn(),
}));

const mockedGetGames = vi.mocked(getGames);
const mockedGetGroupMembers = vi.mocked(getGroupMembers);
const mockedRenameGroup = vi.mocked(renameGroup);
const mockedSetGroupGames = vi.mocked(setGroupGames);
const mockedRemoveMember = vi.mocked(removeMember);
const mockedResetGroupInvite = vi.mocked(resetGroupInvite);
const mockedDeleteGroup = vi.mocked(deleteGroup);
const mockedUseBoard = vi.mocked(useBoard);

const catalogGames: Game[] = [
  { id: "game-1", name: "Chess", type: "outcome", metricDirection: "higher_better", hasVariants: false },
  { id: "game-2", name: "Darts", type: "timed", metricDirection: "lower_better", hasVariants: false },
  { id: "game-3", name: "Pool", type: "outcome", metricDirection: "higher_better", hasVariants: false },
];

const trackedGames: Game[] = [catalogGames[0], catalogGames[1]];

const members = [
  { userId: "u1", displayName: "Abeer", role: "admin" as const },
  { userId: "u2", displayName: "Sam", role: "member" as const },
];

function mockGetGamesImpl(): void {
  mockedGetGames.mockImplementation((group?: string) => {
    if (group) {
      return Promise.resolve({ ok: true, data: { games: trackedGames } });
    }
    return Promise.resolve({ ok: true, data: { games: catalogGames } });
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ManageGroup", () => {
  function setup() {
    mockedUseBoard.mockReturnValue({
      boardId: "g1",
      board: { id: "g1", name: "Family Night", role: "admin" },
      groups: [],
      loading: false,
      select: vi.fn(),
      refresh: vi.fn(),
    });
    mockGetGamesImpl();
    mockedGetGroupMembers.mockResolvedValue({ ok: true, data: { members } });
    mockedRenameGroup.mockResolvedValue({ ok: true, data: { ok: true } });
    mockedSetGroupGames.mockResolvedValue({ ok: true, data: { ok: true } });
    mockedRemoveMember.mockResolvedValue({ ok: true, data: { ok: true } });
    mockedResetGroupInvite.mockResolvedValue({
      ok: true,
      data: { link: "https://bragboard.app/join/reset123" },
    });
    mockedDeleteGroup.mockResolvedValue({ ok: true, data: { ok: true } });
  }

  it("renders the current group name and the member list", async () => {
    setup();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    expect(screen.getByText(/^Manage$/i)).toBeTruthy();
    expect((screen.getByLabelText(/group name/i) as HTMLInputElement).value).toBe("Family Night");

    await waitFor(() => expect(screen.getByText("Abeer")).toBeTruthy());
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("renames the group and calls onChanged on success", async () => {
    setup();
    const onChanged = vi.fn();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={onChanged} onDeleted={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mockedRenameGroup).toHaveBeenCalledWith("g1", "New Name"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("loads the catalog prechecked to the tracked set, and Save sends the toggled set", async () => {
    setup();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    expect((screen.getByLabelText("Chess") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Darts") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Pool") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByLabelText("Pool"));
    fireEvent.click(screen.getByLabelText("Darts"));
    fireEvent.click(screen.getByRole("button", { name: /save games/i }));

    await waitFor(() =>
      expect(mockedSetGroupGames).toHaveBeenCalledWith("g1", ["game-1", "game-3"])
    );
  });

  it("removes a member and re-fetches the member list", async () => {
    setup();
    mockedGetGroupMembers
      .mockResolvedValueOnce({ ok: true, data: { members } })
      .mockResolvedValueOnce({ ok: true, data: { members: [members[0]] } });

    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText("Sam")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(mockedRemoveMember).toHaveBeenCalledWith("g1", "u2"));
    await waitFor(() => expect(mockedGetGroupMembers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Sam")).toBeNull());
  });

  it("does not show a Remove button for the admin row", async () => {
    setup();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText("Abeer")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: /remove/i }).length).toBe(1);
  });

  it("resets the invite link and shows it with a Copy button", async () => {
    setup();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /reset link/i }));

    await waitFor(() => expect(mockedResetGroupInvite).toHaveBeenCalledWith("g1"));
    await waitFor(() =>
      expect(screen.getByText("https://bragboard.app/join/reset123")).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("copies the invite link when Copy is clicked (guarded clipboard)", async () => {
    setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /reset link/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith("https://bragboard.app/join/reset123");
  });

  it("does not throw when clipboard is unavailable", async () => {
    setup();
    Object.assign(navigator, { clipboard: undefined });

    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /reset link/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy());
    expect(() => fireEvent.click(screen.getByRole("button", { name: /copy/i }))).not.toThrow();
  });

  it("deletes the group after confirmation and calls onDeleted", async () => {
    setup();
    const onDeleted = vi.fn();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={onDeleted} />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete group/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(mockedDeleteGroup).toHaveBeenCalledWith("g1"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("does not call deleteGroup until the delete is confirmed", async () => {
    setup();
    render(
      <ManageGroup groupId="g1" onClose={vi.fn()} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete group/i }));
    expect(mockedDeleteGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("button", { name: /confirm delete/i })).toBeNull();
  });

  it("calls onClose when Close is clicked", async () => {
    setup();
    const onClose = vi.fn();
    render(
      <ManageGroup groupId="g1" onClose={onClose} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    setup();
    const onClose = vi.fn();
    render(
      <ManageGroup groupId="g1" onClose={onClose} onChanged={vi.fn()} onDeleted={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("manage-group-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
