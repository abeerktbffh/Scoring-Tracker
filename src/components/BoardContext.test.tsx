// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BoardProvider, useBoard } from "./BoardContext";
import { listMyGroups } from "@/lib/api";
import { loadBoardId, saveBoardId } from "@/lib/currentBoard";

vi.mock("@/lib/api", () => ({
  listMyGroups: vi.fn(),
}));

vi.mock("@/lib/currentBoard", () => ({
  loadBoardId: vi.fn(),
  saveBoardId: vi.fn(),
}));

const mockedListMyGroups = vi.mocked(listMyGroups);
const mockedLoadBoardId = vi.mocked(loadBoardId);
const mockedSaveBoardId = vi.mocked(saveBoardId);

function Probe() {
  const { boardId, board, groups, loading, select, refresh } = useBoard();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="boardId">{boardId ?? "GLOBAL"}</div>
      <div data-testid="boardName">{board ? board.name : "GLOBAL"}</div>
      <div data-testid="groups">{groups.map((g) => g.id).join(",")}</div>
      <button onClick={() => select("g1")}>select-g1</button>
      <button onClick={() => select(null)}>select-global</button>
      <button onClick={() => refresh()}>refresh</button>
    </div>
  );
}

beforeEach(() => {
  mockedLoadBoardId.mockReturnValue(null);
  mockedListMyGroups.mockResolvedValue({
    ok: true,
    data: { groups: [{ id: "g1", name: "Fam", role: "admin" }] },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BoardContext", () => {
  it("throws when useBoard is used outside a BoardProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
    spy.mockRestore();
  });

  it("defaults to Global while loading, then resolves with fetched groups", async () => {
    render(
      <BoardProvider>
        <Probe />
      </BoardProvider>
    );

    expect(screen.getByTestId("boardId").textContent).toBe("GLOBAL");

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("groups").textContent).toBe("g1");
    expect(screen.getByTestId("boardId").textContent).toBe("GLOBAL");
    expect(screen.getByTestId("boardName").textContent).toBe("GLOBAL");
  });

  it("select persists via saveBoardId and updates boardId/board", async () => {
    render(
      <BoardProvider>
        <Probe />
      </BoardProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("select-g1"));

    expect(mockedSaveBoardId).toHaveBeenCalledWith("g1");
    expect(screen.getByTestId("boardId").textContent).toBe("g1");
    expect(screen.getByTestId("boardName").textContent).toBe("Fam");
  });

  it("selecting null persists Global via saveBoardId", async () => {
    render(
      <BoardProvider>
        <Probe />
      </BoardProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("select-g1"));
    fireEvent.click(screen.getByText("select-global"));

    expect(mockedSaveBoardId).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("boardId").textContent).toBe("GLOBAL");
  });

  it("resets a stale persisted id (left/deleted group) to Global once groups load", async () => {
    mockedLoadBoardId.mockReturnValue("stale-id");

    render(
      <BoardProvider>
        <Probe />
      </BoardProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("boardId").textContent).toBe("GLOBAL");
    expect(mockedSaveBoardId).toHaveBeenCalledWith(null);
  });

  it("keeps a valid persisted id after groups load", async () => {
    mockedLoadBoardId.mockReturnValue("g1");

    render(
      <BoardProvider>
        <Probe />
      </BoardProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("boardId").textContent).toBe("g1");
    expect(screen.getByTestId("boardName").textContent).toBe("Fam");
    expect(mockedSaveBoardId).not.toHaveBeenCalled();
  });

  it("refresh re-fetches groups and reconciles a now-stale selection", async () => {
    render(
      <BoardProvider>
        <Probe />
      </BoardProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("select-g1"));
    expect(screen.getByTestId("boardId").textContent).toBe("g1");

    mockedListMyGroups.mockResolvedValue({
      ok: true,
      data: { groups: [{ id: "g2", name: "Other", role: "member" }] },
    });

    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() => expect(screen.getByTestId("groups").textContent).toBe("g2"));
    await waitFor(() => expect(screen.getByTestId("boardId").textContent).toBe("GLOBAL"));
    expect(mockedSaveBoardId).toHaveBeenCalledWith(null);
  });
});
