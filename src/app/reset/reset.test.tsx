// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ResetPage from "./page";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue("good-token");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillPasswords(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/^confirm password$/i), { target: { value: confirm } });
}

describe("ResetPage", () => {
  it("shows a client-side error and does not submit when passwords don't match", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ResetPage />);

    fillPasswords("brand-new-password", "does-not-match");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/don.t match/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs {token, newPassword} to /api/auth/reset when passwords match", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ResetPage />);

    fillPasswords("brand-new-password", "brand-new-password");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/reset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "good-token", newPassword: "brand-new-password" }),
        })
      )
    );
  });

  it("shows a success message and sign-in link when the reset succeeds", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch;

    render(<ResetPage />);

    fillPasswords("brand-new-password", "brand-new-password");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
  });

  it("shows the generic invalid/expired message when the reset fails", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) }) as unknown as typeof fetch;

    render(<ResetPage />);

    fillPasswords("brand-new-password", "brand-new-password");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
  });
});
