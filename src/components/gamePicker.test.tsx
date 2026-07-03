// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GamePicker } from "./GamePicker";

afterEach(() => {
  cleanup();
});

const games = [
  { id: "connections", name: "Connections" },
  { id: "mini", name: "NYT Mini" },
  { id: "crossclimb", name: "Crossclimb" },
  { id: "minute-cryptic", name: "Minute Cryptic" },
  { id: "pinpoint", name: "Pinpoint" },
];

describe("GamePicker", () => {
  it("renders due games under Today and the rest under All games", () => {
    render(<GamePicker games={games} dueTodayIds={["mini", "connections"]} onPick={vi.fn()} />);

    expect(screen.getByText(/today/i)).toBeTruthy();
    expect(screen.getByText(/all games \(3\)/i)).toBeTruthy();
    expect(screen.getByText("Connections")).toBeTruthy();
    expect(screen.getByText("NYT Mini")).toBeTruthy();
    expect(screen.getByText("Crossclimb")).toBeTruthy();
  });

  it("shows a DUE marker on due games only", () => {
    render(<GamePicker games={games} dueTodayIds={["mini"]} onPick={vi.fn()} />);

    const miniRow = screen.getByText("NYT Mini").closest("li");
    expect(miniRow?.textContent).toContain("DUE");

    const pinpointRow = screen.getByText("Pinpoint").closest("li");
    expect(pinpointRow?.textContent).not.toContain("DUE");
  });

  it("narrows the visible list when typing in the search input", () => {
    render(<GamePicker games={games} dueTodayIds={["mini"]} onPick={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "min" } });

    expect(screen.getByText("NYT Mini")).toBeTruthy();
    expect(screen.getByText("Minute Cryptic")).toBeTruthy();
    expect(screen.queryByText("Connections")).toBeNull();
    expect(screen.queryByText("Crossclimb")).toBeNull();
    expect(screen.queryByText("Pinpoint")).toBeNull();
  });

  it("search is case-insensitive", () => {
    render(<GamePicker games={games} dueTodayIds={[]} onPick={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "PIN" } });

    expect(screen.getByText("Pinpoint")).toBeTruthy();
    expect(screen.queryByText("Connections")).toBeNull();
  });

  it("calls onPick with the game id when a row is clicked", () => {
    const onPick = vi.fn();
    render(<GamePicker games={games} dueTodayIds={["mini"]} onPick={onPick} />);

    fireEvent.click(screen.getByText("Crossclimb"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("crossclimb");
  });

  it("clicking a due row also calls onPick with its id", () => {
    const onPick = vi.fn();
    render(<GamePicker games={games} dueTodayIds={["mini"]} onPick={onPick} />);

    fireEvent.click(screen.getByText("NYT Mini"));
    expect(onPick).toHaveBeenCalledWith("mini");
  });
});
