// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SignInGate } from "./SignInGate";
import { signIn } from "next-auth/react";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

const mockedSignIn = vi.mocked(signIn);

function mockProvidersFetch(providers: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => providers,
  });
}

beforeEach(() => {
  mockedSignIn.mockReset();
  global.fetch = mockProvidersFetch({
    credentials: { id: "credentials", name: "Credentials" },
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SignInGate", () => {
  it("calls signIn('credentials', ...) with the entered email and password", async () => {
    mockedSignIn.mockResolvedValue({ ok: true, error: undefined, status: 200, url: "/" } as never);
    const onAuthed = vi.fn();
    render(<SignInGate onAuthed={onAuthed} />);

    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "abeer@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(mockedSignIn).toHaveBeenCalledWith("credentials", {
        email: "abeer@example.com",
        password: "correct-horse-battery",
        redirect: false,
      })
    );
    await waitFor(() => expect(onAuthed).toHaveBeenCalledTimes(1));
  });

  it("shows a friendly error message when credentials sign-in fails", async () => {
    mockedSignIn.mockResolvedValue({
      ok: false,
      error: "CredentialsSignin",
      status: 401,
      url: null,
    } as never);
    const onAuthed = vi.fn();
    render(<SignInGate onAuthed={onAuthed} />);

    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "abeer@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/wrong email or password, or your email isn.t verified yet/i)
      ).toBeTruthy()
    );
    expect(onAuthed).not.toHaveBeenCalled();
  });

  it("posts to /api/auth/register and shows the verify-email state on success", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/providers") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ credentials: { id: "credentials", name: "Credentials" } }),
        });
      }
      if (url === "/api/auth/register") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<SignInGate onAuthed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "brand-new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/register",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "new@example.com", password: "brand-new-password" }),
        })
      )
    );
    await waitFor(() => expect(screen.getByText(/check your email to verify/i)).toBeTruthy());
  });

  it("shows an already-registered message on a 409 from register", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/providers") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === "/api/auth/register") {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: "This email is already registered — sign in instead." }),
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<SignInGate onAuthed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "taken@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "brand-new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() =>
      expect(screen.getByText(/already registered/i)).toBeTruthy()
    );
  });

  it("shows the Google button and calls signIn('google') when Google is configured", async () => {
    global.fetch = mockProvidersFetch({
      google: { id: "google", name: "Google" },
      credentials: { id: "credentials", name: "Credentials" },
    }) as unknown as typeof fetch;

    render(<SignInGate onAuthed={vi.fn()} />);

    const googleButton = await screen.findByRole("button", { name: /continue with google/i });
    fireEvent.click(googleButton);

    expect(mockedSignIn).toHaveBeenCalledWith("google");
  });

  it("does not show the Google button when Google is not configured", async () => {
    global.fetch = mockProvidersFetch({
      credentials: { id: "credentials", name: "Credentials" },
    }) as unknown as typeof fetch;

    render(<SignInGate onAuthed={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
  });

  it("shows the enumeration-safe confirmation after requesting a password reset", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/providers") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === "/api/auth/reset") {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<SignInGate onAuthed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "someone@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/reset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "someone@example.com" }),
        })
      )
    );
    await waitFor(() =>
      expect(screen.getByText(/if that email exists, we sent a link/i)).toBeTruthy()
    );
  });
});
