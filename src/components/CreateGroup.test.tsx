// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CreateGroup } from "./CreateGroup";
import { getGames, createGroup } from "@/lib/api";
import type { Game } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGames: vi.fn(),
  createGroup: vi.fn(),
}));

const mockedGetGames = vi.mocked(getGames);
const mockedCreateGroup = vi.mocked(createGroup);

const games: Game[] = [
  { id: "game-1", name: "Chess", type: "outcome", metricDirection: "higher_better", hasVariants: false },
  { id: "game-2", name: "Darts", type: "timed", metricDirection: "lower_better", hasVariants: false },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateGroup", () => {
  it("renders nothing when closed", () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    const { container } = render(
      <CreateGroup open={false} onClose={vi.fn()} onCreated={vi.fn()} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("loads the catalog games and renders a checklist, all checked by default", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    render(<CreateGroup open onClose={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    expect((screen.getByLabelText("Chess") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Darts") as HTMLInputElement).checked).toBe(true);
  });

  it("disables Create when the name is empty", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    render(<CreateGroup open onClose={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    expect((screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Fam" } });
    expect((screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it("submits with the name and the checked game ids, unchecking removes a game", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    mockedCreateGroup.mockResolvedValue({
      ok: true,
      data: { id: "g1", link: "https://bragboard.app/join/abc123" },
    });
    render(<CreateGroup open onClose={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Family Night" } });
    fireEvent.click(screen.getByLabelText("Darts"));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() =>
      expect(mockedCreateGroup).toHaveBeenCalledWith("Family Night", ["game-1"])
    );
  });

  it("shows the shareable link with a Copy button and calls onCreated on success", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    mockedCreateGroup.mockResolvedValue({
      ok: true,
      data: { id: "g1", link: "https://bragboard.app/join/abc123" },
    });
    const onCreated = vi.fn();
    render(<CreateGroup open onClose={vi.fn()} onCreated={onCreated} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Family Night" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText("https://bragboard.app/join/abc123")).toBeTruthy());
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
    expect(onCreated).toHaveBeenCalledWith("g1");
  });

  it("copies the link when Copy is clicked (guarded clipboard)", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    mockedCreateGroup.mockResolvedValue({
      ok: true,
      data: { id: "g1", link: "https://bragboard.app/join/abc123" },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CreateGroup open onClose={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Family Night" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith("https://bragboard.app/join/abc123");
  });

  it("does not throw when clipboard is unavailable", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    mockedCreateGroup.mockResolvedValue({
      ok: true,
      data: { id: "g1", link: "https://bragboard.app/join/abc123" },
    });
    Object.assign(navigator, { clipboard: undefined });
    render(<CreateGroup open onClose={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Family Night" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy());
    expect(() => fireEvent.click(screen.getByRole("button", { name: /copy/i }))).not.toThrow();
  });

  it("shows the server error message when creation fails", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    mockedCreateGroup.mockResolvedValue({ ok: false, error: "Name already taken", status: 400 });
    const onCreated = vi.fn();
    render(<CreateGroup open onClose={vi.fn()} onCreated={onCreated} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Family Night" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText(/name already taken/i)).toBeTruthy());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    const onClose = vi.fn();
    render(<CreateGroup open onClose={onClose} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    mockedGetGames.mockResolvedValue({ ok: true, data: { games } });
    const onClose = vi.fn();
    render(<CreateGroup open onClose={onClose} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Chess")).toBeTruthy());
    fireEvent.click(screen.getByTestId("create-group-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
