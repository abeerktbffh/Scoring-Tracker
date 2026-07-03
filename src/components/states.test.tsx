// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EmptyState } from "./EmptyState";
import { LockedState } from "./LockedState";
import { ErrorState } from "./ErrorState";

afterEach(() => {
  cleanup();
});

describe("ErrorState", () => {
  it("renders the message and calls onRetry when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Something went sideways." onRetry={onRetry} />);

    expect(screen.getByText("Something went sideways.").textContent).toContain(
      "Something went sideways."
    );

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyState", () => {
  it("renders title and body", () => {
    render(<EmptyState title="No entries yet" body="Log your first puzzle to get started." />);

    expect(screen.getByText("No entries yet").textContent).toContain("No entries yet");
    expect(screen.getByText("Log your first puzzle to get started.").textContent).toContain(
      "Log your first puzzle to get started."
    );
  });

  it("does not show an action button when action is omitted", () => {
    render(<EmptyState title="No entries yet" body="Log your first puzzle to get started." />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the action button when action is provided and fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No entries yet"
        body="Log your first puzzle to get started."
        action={{ label: "Log a puzzle", onClick }}
      />
    );

    const actionBtn = screen.getByRole("button", { name: "Log a puzzle" });
    expect(actionBtn.textContent).toContain("Log a puzzle");
    fireEvent.click(actionBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("LockedState", () => {
  it("renders its children", () => {
    render(
      <LockedState>
        <p>Log today&apos;s puzzle to reveal today&apos;s standings.</p>
      </LockedState>
    );

    expect(
      screen.getByText("Log today's puzzle to reveal today's standings.").textContent
    ).toContain("Log today's puzzle to reveal today's standings.");
  });
});
