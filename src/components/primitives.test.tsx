// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Tile } from "./Tile";
import { StatCard } from "./StatCard";
import { StreakBadge } from "./StreakBadge";
import { Skeleton } from "./Skeleton";

describe("Tile", () => {
  it("carries a solved class/data-attr when state is solved", () => {
    const { container } = render(<Tile state="solved" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-state")).toBe("solved");
  });

  it("carries a partial class/data-attr when state is partial", () => {
    const { container } = render(<Tile state="partial" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-state")).toBe("partial");
  });

  it("carries an empty class/data-attr when state is empty", () => {
    const { container } = render(<Tile state="empty" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-state")).toBe("empty");
  });
});

describe("StreakBadge", () => {
  it("renders no flame when count is 0", () => {
    const { container } = render(<StreakBadge count={0} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the count and a flame icon when count is 7", () => {
    const { container } = render(<StreakBadge count={7} />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("Button", () => {
  it("sets the amber variant class", () => {
    render(<Button variant="amber">Save entry</Button>);
    const btn = screen.getByRole("button", { name: "Save entry" });
    expect(btn.className).toMatch(/amber/i);
  });

  it("forwards native button props", () => {
    render(
      <Button variant="primary" disabled>
        Log it
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Log it" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("Chip", () => {
  it("sets aria-pressed to true when active", () => {
    render(<Chip active>Wordle</Chip>);
    const chip = screen.getByText("Wordle");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("sets aria-pressed to false when not active", () => {
    render(<Chip>Pips</Chip>);
    const chip = screen.getByText("Pips");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("Card", () => {
  it("renders children inside a card container", () => {
    render(
      <Card>
        <p>Inside</p>
      </Card>
    );
    expect(screen.getByText("Inside")).toBeTruthy();
  });

  it("merges a custom className", () => {
    const { container } = render(<Card className="extra">hi</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/extra/);
  });
});

describe("StatCard", () => {
  it("renders the value and label", () => {
    render(<StatCard value="16" label="Wins" />);
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.getByText("Wins")).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("renders a block element", () => {
    const { container } = render(<Skeleton w={40} h={20} radius={4} />);
    expect(container.firstElementChild).toBeTruthy();
  });
});
