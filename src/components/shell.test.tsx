// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TabBar } from "./TabBar";
import { Drawer } from "./Drawer";
import { AppShell } from "./AppShell";
import { getGames, listMyGroups } from "@/lib/api";
import { signOut } from "next-auth/react";

const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

vi.mock("@/lib/api", () => ({
  getGames: vi.fn(),
  listMyGroups: vi.fn(),
}));

vi.mock("@/lib/currentBoard", () => ({
  loadBoardId: vi.fn(() => null),
  saveBoardId: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const mockedGetGames = vi.mocked(getGames);
const mockedListMyGroups = vi.mocked(listMyGroups);
const mockedSignOut = vi.mocked(signOut);

function findPostCall(
  fetchMock: ReturnType<typeof vi.fn>,
  urlIncludes: string
): [RequestInfo | URL, RequestInit] | undefined {
  return fetchMock.mock.calls.find(
    (call: unknown[]) =>
      (call[0] as RequestInfo | URL).toString().includes(urlIncludes) &&
      (call[1] as RequestInit | undefined)?.method === "POST"
  ) as [RequestInfo | URL, RequestInit] | undefined;
}

function mockFetchWithOnboarding(onboarding: Record<string, unknown>) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/onboarding")) {
      return Promise.resolve({
        ok: true,
        json: async () => onboarding,
      });
    }
    if (url.includes("/api/auth/providers")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ credentials: { id: "credentials", name: "Credentials" } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

beforeEach(() => {
  mockSearchParams.forEach((_v, k) => mockSearchParams.delete(k));
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

  // SignInGate (rendered when signed out) probes Auth.js's providers endpoint
  // on mount to decide whether to show the Google button.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ credentials: { id: "credentials", name: "Credentials" } }),
  }) as unknown as typeof fetch;

  // BoardProvider (mounted for the authed shell subtree) fetches groups on mount.
  mockedListMyGroups.mockResolvedValue({ ok: true, data: { groups: [] } });
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
  it("shows a Sign out control and a theme toggle when open", () => {
    render(<Drawer open={true} onClose={vi.fn()} theme="light" setTheme={vi.fn()} />);

    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /theme/i })).toBeTruthy();
  });

  it("calls signOut when Sign out is clicked", () => {
    render(<Drawer open={true} onClose={vi.fn()} theme="light" setTheme={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(mockedSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
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

    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeTruthy());
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("renders children, TabBar, and a menu button when authed and already a member", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games: [] } });
    global.fetch = mockFetchWithOnboarding({
      alreadyMember: true,
    }) as unknown as typeof fetch;

    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>
    );

    await waitFor(() => expect(screen.getByText("secret content")).toBeTruthy());
    expect(screen.getByRole("button", { name: /menu/i })).toBeTruthy();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    expect(mockedListMyGroups).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /global/i })).toBeTruthy();
  });

  it("shows the name-entry onboarding screen for a new user, without rendering the app", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games: [] } });
    global.fetch = mockFetchWithOnboarding({
      alreadyMember: false,
    }) as unknown as typeof fetch;

    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>
    );

    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeTruthy());
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("supports the create-player path and POSTs {displayName}", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games: [] } });
    const fetchMock = mockFetchWithOnboarding({
      alreadyMember: false,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>
    );

    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Abeer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create my player/i }));

    await waitFor(() => {
      const postCall = findPostCall(fetchMock, "/api/onboarding");
      expect(postCall).toBeTruthy();
      expect(JSON.parse(postCall![1].body as string)).toEqual({
        displayName: "Abeer",
      });
    });
  });
});
