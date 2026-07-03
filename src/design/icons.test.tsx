// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Flame, Crown } from "./icons";
describe("icons", () => {
  it("render inline svg that inherits color", () => {
    const { container } = render(<Flame />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    render(<Crown size={22} />);
  });
});
