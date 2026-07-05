// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { BoardSwitcher } from "./BoardSwitcher";
import { useBoard } from "@/components/BoardContext";
import type { Board } from "@/components/BoardContext";

vi.mock("@/components/BoardContext", () => ({
  useBoard: vi.fn(),
}));

const mockedUseBoard = vi.mocked(useBoard);

const groups: Board[] = [
  { id: "g1", name: "Family Game Night", role: "admin" },
  { id: "g2", name: "Office League", role: "member" },
];

function setBoard(overrides: Partial<ReturnType<typeof useBoard>> = {}) {
  const select = vi.fn();
  const refresh = vi.fn();
  mockedUseBoard.mockReturnValue({
    boardId: null,
    board: null,
    groups,
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

describe("BoardSwitcher", () => {
  it("shows 'Global' as the title when boardId is null", () => {
    setBoard();
    render(<BoardSwitcher onNewGroup={vi.fn()} />);

    expect(screen.getByRole("button", { name: /global/i })).toBeTruthy();
  });

  it("shows the current board's name as the title when a board is selected", () => {
    setBoard({ boardId: "g1", board: groups[0] });
    render(<BoardSwitcher onNewGroup={vi.fn()} />);

    expect(screen.getByRole("button", { name: /family game night/i })).toBeTruthy();
  });

  it("opens a menu listing Global, each group, and New group", () => {
    setBoard();
    render(<BoardSwitcher onNewGroup={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /global/i }));
    const panel = within(screen.getByTestId("menu-panel"));

    expect(panel.getByText(/your boards/i)).toBeTruthy();
    expect(panel.getByText("Global")).toBeTruthy();
    expect(panel.getByText("Family Game Night")).toBeTruthy();
    expect(panel.getByText("Office League")).toBeTruthy();
    expect(panel.getByText(/new group/i)).toBeTruthy();
  });

  it("calls select(id) when a group is clicked, and closes the menu", () => {
    const { select } = setBoard();
    render(<BoardSwitcher onNewGroup={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /global/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText("Family Game Night"));

    expect(select).toHaveBeenCalledWith("g1");
    expect(screen.getByTestId("menu-panel").getAttribute("aria-hidden")).toBe("true");
  });

  it("calls select(null) when Global is clicked from within the menu", () => {
    const { select } = setBoard({ boardId: "g1", board: groups[0] });
    render(<BoardSwitcher onNewGroup={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /family game night/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText("Global"));

    expect(select).toHaveBeenCalledWith(null);
  });

  it("calls onNewGroup when 'New group' is clicked", () => {
    setBoard();
    const onNewGroup = vi.fn();
    render(<BoardSwitcher onNewGroup={onNewGroup} />);

    fireEvent.click(screen.getByRole("button", { name: /global/i }));
    fireEvent.click(within(screen.getByTestId("menu-panel")).getByText(/new group/i));

    expect(onNewGroup).toHaveBeenCalledTimes(1);
  });

  it("shows a checkmark next to the selected board", () => {
    setBoard({ boardId: "g2", board: groups[1] });
    render(<BoardSwitcher onNewGroup={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /office league/i }));
    const panel = within(screen.getByTestId("menu-panel"));

    const officeItem = panel.getByText("Office League").closest("button");
    const globalItem = panel.getByText("Global").closest("button");
    expect(officeItem?.querySelector("svg")).toBeTruthy();
    expect(globalItem?.querySelector("svg")).toBeNull();
  });
});
