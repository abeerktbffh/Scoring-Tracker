// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { GroupOverflowMenu } from "./GroupOverflowMenu";
import { useBoard } from "@/components/BoardContext";
import type { Board } from "@/components/BoardContext";
import { getGroupInvite, leaveGroup } from "@/lib/api";

vi.mock("@/components/BoardContext", () => ({
  useBoard: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getGroupInvite: vi.fn(),
  leaveGroup: vi.fn(),
}));

const mockedUseBoard = vi.mocked(useBoard);
const mockedGetGroupInvite = vi.mocked(getGroupInvite);
const mockedLeaveGroup = vi.mocked(leaveGroup);

const adminBoard: Board = { id: "g1", name: "Family Game Night", role: "admin" };
const memberBoard: Board = { id: "g2", name: "Office League", role: "member" };

function setBoard(overrides: Partial<ReturnType<typeof useBoard>> = {}) {
  const select = vi.fn();
  const refresh = vi.fn();
  mockedUseBoard.mockReturnValue({
    boardId: null,
    board: null,
    groups: [],
    loading: false,
    select,
    refresh,
    ...overrides,
  });
  return { select, refresh };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GroupOverflowMenu", () => {
  it("renders nothing when board is null (Global)", () => {
    setBoard({ boardId: null, board: null });
    const { container } = render(<GroupOverflowMenu onManage={vi.fn()} />);

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when board is undefined", () => {
    setBoard({ boardId: null, board: undefined as unknown as Board | null });
    const { container } = render(<GroupOverflowMenu onManage={vi.fn()} />);

    expect(container.innerHTML).toBe("");
  });

  it("shows Manage group, Invite, and Leave group for an admin board", () => {
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    const panel = within(screen.getByTestId("menu-panel"));

    expect(panel.getByText(/manage group/i)).toBeTruthy();
    expect(panel.getByText(/^invite$/i)).toBeTruthy();
    expect(panel.getByText(/leave group/i)).toBeTruthy();
  });

  it("shows only Invite and Leave group for a member board (no Manage)", () => {
    setBoard({ boardId: memberBoard.id, board: memberBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    const panel = within(screen.getByTestId("menu-panel"));

    expect(panel.queryByText(/manage group/i)).toBeNull();
    expect(panel.getByText(/^invite$/i)).toBeTruthy();
    expect(panel.getByText(/leave group/i)).toBeTruthy();
  });

  it("calls onManage and closes the menu when Manage group is clicked", () => {
    const onManage = vi.fn();
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={onManage} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/manage group/i));

    expect(onManage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("menu-panel").getAttribute("aria-hidden")).toBe("true");
  });

  it("calls getGroupInvite and shows the returned link when Invite is clicked", async () => {
    mockedGetGroupInvite.mockResolvedValue({ ok: true, data: { link: "https://bragboard.app/join/abc123" } });
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/^invite$/i));

    expect(mockedGetGroupInvite).toHaveBeenCalledWith("g1");
    await waitFor(() =>
      expect(
        within(screen.getByTestId("menu-panel")).getByText("https://bragboard.app/join/abc123")
      ).toBeTruthy()
    );
  });

  it("shows an error message when the invite request fails", async () => {
    mockedGetGroupInvite.mockResolvedValue({ ok: false, error: "Something went wrong", status: 500 });
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/^invite$/i));

    await waitFor(() =>
      expect(within(screen.getByTestId("menu-panel")).getByText(/something went wrong/i)).toBeTruthy()
    );
  });

  it("copies the invite link to the clipboard when Copy is clicked", async () => {
    mockedGetGroupInvite.mockResolvedValue({ ok: true, data: { link: "https://bragboard.app/join/abc123" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/^invite$/i));
    await waitFor(() =>
      expect(within(screen.getByTestId("menu-panel")).getByText(/copy/i)).toBeTruthy()
    );
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/copy/i));

    expect(writeText).toHaveBeenCalledWith("https://bragboard.app/join/abc123");
  });

  it("does not throw when clipboard is unavailable", async () => {
    mockedGetGroupInvite.mockResolvedValue({ ok: true, data: { link: "https://bragboard.app/join/abc123" } });
    Object.assign(navigator, { clipboard: undefined });
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/^invite$/i));
    await waitFor(() =>
      expect(within(screen.getByTestId("menu-panel")).getByText(/copy/i)).toBeTruthy()
    );

    expect(() =>
      fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/copy/i))
    ).not.toThrow();
  });

  it("requires confirmation before leaving, then calls leaveGroup, select(null), and refresh", async () => {
    mockedLeaveGroup.mockResolvedValue({ ok: true, data: { ok: true } });
    const { select, refresh } = setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/leave group/i));

    // Confirmation step: leaveGroup should not fire yet.
    expect(mockedLeaveGroup).not.toHaveBeenCalled();
    const panel = within(screen.getByTestId("menu-panel"));
    expect(panel.getByText(/are you sure/i)).toBeTruthy();

    fireEvent.click(panel.getByRole("button", { name: /^leave$/i }));

    await waitFor(() => expect(mockedLeaveGroup).toHaveBeenCalledWith("g1"));
    expect(select).toHaveBeenCalledWith(null);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels the leave confirmation without calling leaveGroup", () => {
    setBoard({ boardId: adminBoard.id, board: adminBoard });
    render(<GroupOverflowMenu onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /group options/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/leave group/i));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByRole("button", { name: /cancel/i }));

    expect(mockedLeaveGroup).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("menu-panel")).getByText(/^invite$/i)).toBeTruthy();
  });
});
