// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import VerifyPage from "./page";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

beforeEach(() => {
  mockGet.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VerifyPage", () => {
  it("POSTs the token from the URL to /api/auth/verify on mount", async () => {
    mockGet.mockReturnValue("good-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VerifyPage />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/verify",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "good-token" }),
        })
      )
    );
  });

  it("shows a success message and sign-in link when verification succeeds", async () => {
    mockGet.mockReturnValue("good-token");
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch;

    render(<VerifyPage />);

    await waitFor(() =>
      expect(screen.getByText(/your email is verified.*sign in now/i)).toBeTruthy()
    );
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
  });

  it("shows the generic invalid/expired message when verification fails", async () => {
    mockGet.mockReturnValue("bad-token");
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) }) as unknown as typeof fetch;

    render(<VerifyPage />);

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy()
    );
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
  });

  it("shows the generic error state when there is no token in the URL", async () => {
    mockGet.mockReturnValue(null);
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VerifyPage />);

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy()
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
