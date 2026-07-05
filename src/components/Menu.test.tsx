// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Menu, MenuItem, MenuLabel } from "./Menu";

afterEach(() => {
  cleanup();
});

describe("Menu", () => {
  it("renders its children and a dialog when open", () => {
    render(
      <Menu open onClose={vi.fn()}>
        <p>Menu content</p>
      </Menu>
    );

    expect(screen.getByText("Menu content")).toBeTruthy();
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-hidden")).toBe("false");
  });

  it("marks the dialog aria-hidden when closed", () => {
    render(
      <Menu open={false} onClose={vi.fn()}>
        <p>Menu content</p>
      </Menu>
    );

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.getAttribute("aria-hidden")).toBe("true");
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Menu open onClose={onClose}>
        <p>Menu content</p>
      </Menu>
    );

    fireEvent.click(screen.getByTestId("menu-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(
      <Menu open onClose={onClose}>
        <p>Menu content</p>
      </Menu>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape when closed", () => {
    const onClose = vi.fn();
    render(
      <Menu open={false} onClose={onClose}>
        <p>Menu content</p>
      </Menu>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up the Escape listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Menu open onClose={onClose}>
        <p>Menu content</p>
      </Menu>
    );

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders an optional title", () => {
    render(
      <Menu open onClose={vi.fn()} title="Options">
        <p>Menu content</p>
      </Menu>
    );

    expect(screen.getByText("Options")).toBeTruthy();
  });

  it("fires MenuItem onClick handlers", () => {
    const onClick = vi.fn();
    render(
      <Menu open onClose={vi.fn()}>
        <MenuItem onClick={onClick}>Rename</MenuItem>
      </Menu>
    );

    fireEvent.click(screen.getByText("Rename"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies a danger class to danger MenuItems", () => {
    render(
      <Menu open onClose={vi.fn()}>
        <MenuItem onClick={vi.fn()} danger>
          Delete group
        </MenuItem>
        <MenuItem onClick={vi.fn()}>Regular item</MenuItem>
      </Menu>
    );

    const dangerItem = screen.getByText("Delete group").closest("button");
    const regularItem = screen.getByText("Regular item").closest("button");
    expect(dangerItem?.className).toMatch(/danger/i);
    expect(regularItem?.className).not.toMatch(/danger/i);
  });

  it("renders MenuLabel as a section label", () => {
    render(
      <Menu open onClose={vi.fn()}>
        <MenuLabel>Danger zone</MenuLabel>
      </Menu>
    );

    expect(screen.getByText("Danger zone")).toBeTruthy();
  });
});
