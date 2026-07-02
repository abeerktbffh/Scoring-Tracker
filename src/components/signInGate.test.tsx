// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SignInGate } from "./SignInGate";
import { postAuth } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  postAuth: vi.fn(),
}));

const mockedPostAuth = vi.mocked(postAuth);

beforeEach(() => {
  window.localStorage.clear();
  mockedPostAuth.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("SignInGate", () => {
  it("calls onAuthed after a successful passphrase submission", async () => {
    mockedPostAuth.mockResolvedValue({ ok: true, data: { ok: true } });
    const onAuthed = vi.fn();
    render(<SignInGate onAuthed={onAuthed} />);

    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() => expect(onAuthed).toHaveBeenCalledTimes(1));
    expect(mockedPostAuth).toHaveBeenCalledWith("correct-horse");
  });

  it("shows the normalized error copy when the passphrase is rejected", async () => {
    mockedPostAuth.mockResolvedValue({ ok: false, error: "Wrong passphrase.", status: 401 });
    const onAuthed = vi.fn();
    render(<SignInGate onAuthed={onAuthed} />);

    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() => expect(screen.getByText("Wrong passphrase.")).toBeTruthy());
    expect(onAuthed).not.toHaveBeenCalled();
  });

  it("pre-fills the name field from a previously remembered name", () => {
    window.localStorage.setItem("st.displayName", "Abeer");
    render(<SignInGate onAuthed={vi.fn()} />);

    const nameInput = screen.getByLabelText(/your name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Abeer");
  });
});
