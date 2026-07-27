// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatPills } from "./StatPills";
import type { DailyContestRow } from "@/lib/api";

afterEach(() => cleanup());

function row(overrides: Partial<DailyContestRow> = {}): DailyContestRow {
  return {
    displayName: "Me",
    value: 141,
    valueFormatted: "141 pts",
    solved: true,
    medal: null,
    detail: { points: 141 },
    variant: null,
    ...overrides,
  };
}

describe("StatPills points shape", () => {
  it("renders a '141 pts' pill for hindu-mini", () => {
    render(<StatPills gameId="hindu-mini" row={row()} />);
    expect(screen.getByText("141 pts")).toBeTruthy();
  });

  it("falls back to row.value when detail has no points (old time entries)", () => {
    render(<StatPills gameId="hindu-mini" row={row({ detail: null, value: 171 })} />);
    expect(screen.getByText("171 pts")).toBeTruthy();
  });
});
