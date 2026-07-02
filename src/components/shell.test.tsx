// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TabBar } from "./TabBar";
import { Drawer } from "./Drawer";
import { AppShell } from "./AppShell";
import { getGames } from "@/lib/api";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

vi.mock("@/lib/api", () => ({
  getGames: vi.fn(),
}));

const mockedGetGames = vi.mocked(getGames);

beforeEach(() => {
  // jsdom doesn't implement matchMedia; useTheme() (consumed by AppShell) calls it
  // on mount to resolve the system preference.
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TabBar", () => {
  it("marks the Standings item current when active is 'standings'", () => {
    render(<TabBar active="standings" />);

    const standingsLink = screen.getByText(/standings/i).closest("a");
    expect(standingsLink?.getAttribute("aria-current")).toBe("page");

    const homeLink = screen.getByText(/home/i).closest("a");
    expect(homeLink?.getAttribute("aria-current")).toBeNull();
  });

  it("renders links to /, /standings, /you, and /log", () => {
    render(<TabBar active="home" />);

    const links = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(links).toContain("/");
    expect(links).toContain("/standings");
    expect(links).toContain("/you");
    expect(links).toContain("/log");
  });
});

describe("Drawer", () => {
  it("shows Sign out and a theme toggle when open", () => {
    render(<Drawer open={true} onClose={vi.fn()} theme="light" setTheme={vi.fn()} />);

    expect(screen.getByText(/sign out/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /theme/i })).toBeTruthy();
  });

  it("calls setTheme with the opposite theme when the toggle is clicked", () => {
    const setTheme = vi.fn();
    render(<Drawer open={true} onClose={vi.fn()} theme="light" setTheme={setTheme} />);

    fireEvent.click(screen.getByRole("button", { name: /theme/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme with light when currently dark", () => {
    const setTheme = vi.fn();
    render(<Drawer open={true} onClose={vi.fn()} theme="dark" setTheme={setTheme} />);

    fireEvent.click(screen.getByRole("button", { name: /theme/i }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("is not visible when open is false", () => {
    render(<Drawer open={false} onClose={vi.fn()} theme="light" setTheme={vi.fn()} />);

    const panel = screen.getByTestId("drawer-panel");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Drawer open={true} onClose={onClose} theme="light" setTheme={vi.fn()} />);

    fireEvent.click(screen.getByTestId("drawer-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has a disabled 'coming soon' Group item and an Admin link", () => {
    render(<Drawer open={true} onClose={vi.fn()} theme="light" setTheme={vi.fn()} />);

    const groupItem = screen.getByText(/group/i).closest("button, [disabled]");
    expect(screen.getByText(/coming soon/i)).toBeTruthy();

    const adminLink = screen.getByText(/admin/i).closest("a");
    expect(adminLink?.getAttribute("href")).toBe("/admin");
    expect(groupItem).toBeTruthy();
  });
});

describe("AppShell", () => {
  it("shows the sign-in gate when getGames returns 401", async () => {
    mockedGetGames.mockResolvedValue({ ok: false, error: "Please sign in again.", status: 401 });

    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>
    );

    await waitFor(() => expect(screen.getByLabelText(/group passphrase/i)).toBeTruthy());
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("renders children, TabBar, and a menu button when authed", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games: [] } });

    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>
    );

    await waitFor(() => expect(screen.getByText("secret content")).toBeTruthy());
    expect(screen.getByRole("button", { name: /menu/i })).toBeTruthy();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});
