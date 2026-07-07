// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Segmented } from "./Segmented";
import { LeaderboardTable } from "./LeaderboardTable";
import type { OverallRow } from "@/lib/api";

afterEach(() => {
  cleanup();
});

const rows: OverallRow[] = [
  { displayName: "DJ", gold: 18, silver: 0, bronze: 0, gamesPlayed: 20, gamesLed: ["wordle"] },
  { displayName: "You", gold: 16, silver: 1, bronze: 0, gamesPlayed: 19, gamesLed: [] },
  { displayName: "Devanshi", gold: 14, silver: 0, bronze: 1, gamesPlayed: 18, gamesLed: [] },
];

describe("Segmented", () => {
  it("renders a group with each option and marks the active one pressed", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { k: "daily", label: "Daily" },
          { k: "weekly", label: "Weekly" },
        ]}
        value="weekly"
        onChange={onChange}
      />
    );

    const group = screen.getByRole("group");
    expect(group).toBeTruthy();

    const dailyBtn = screen.getByRole("button", { name: "Daily" });
    const weeklyBtn = screen.getByRole("button", { name: "Weekly" });
    expect(dailyBtn.getAttribute("aria-pressed")).toBe("false");
    expect(weeklyBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onChange with the clicked option's key", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { k: "daily", label: "Daily" },
          { k: "weekly", label: "Weekly" },
        ]}
        value="weekly"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("daily");
  });
});

describe("LeaderboardTable", () => {
  it("highlights the row matching me with the self-highlight class", () => {
    const { container } = render(<LeaderboardTable rows={rows} me="You" />);

    const youRow = screen.getByText("You").closest("tr");
    expect(youRow).toBeTruthy();
    expect(youRow?.className).toMatch(/me/i);

    const djRow = screen.getByText("DJ").closest("tr");
    expect(djRow?.className || "").not.toMatch(/me/i);
    void container;
  });

  it("shows the crown icon on the rank-1 row", () => {
    render(<LeaderboardTable rows={rows} me="You" />);

    const djRow = screen.getByText("DJ").closest("tr");
    expect(djRow?.querySelector("svg")).toBeTruthy();

    const devanshiRow = screen.getByText("Devanshi").closest("tr");
    expect(devanshiRow?.querySelector("svg")).toBeNull();
  });

  it("renders rank, gold, silver, bronze, and played columns", () => {
    render(<LeaderboardTable rows={rows} me="You" />);

    const djRow = screen.getByText("DJ").closest("tr");
    expect(djRow?.textContent).toContain("1");
    expect(djRow?.textContent).toContain("18");
    expect(djRow?.textContent).toContain("20");
  });
});

describe("LeaderboardTable viewerRow", () => {
  it("renders the viewer's row below a gap with their TRUE rank when outside the visible rows", () => {
    const top = rows; // 3 visible rows (ranks 1-3)
    render(
      <LeaderboardTable
        rows={top}
        me="Yuhnvee"
        viewerRow={{
          row: { displayName: "Yuhnvee", gold: 0, silver: 0, bronze: 2, gamesPlayed: 5, gamesLed: [] },
          rank: 10,
        }}
      />
    );
    // The viewer's name shows...
    expect(screen.getByText("Yuhnvee")).toBeTruthy();
    // ...with the TRUE rank 10, not a list-position rank like 4.
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.queryByText("4")).toBeNull();
  });
});
