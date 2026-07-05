// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { JoinGroup } from "./JoinGroup";
import { getGroupPreview, joinGroup } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGroupPreview: vi.fn(),
  joinGroup: vi.fn(),
}));

const mockedGetGroupPreview = vi.mocked(getGroupPreview);
const mockedJoinGroup = vi.mocked(joinGroup);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JoinGroup", () => {
  it("fetches the preview on mount and shows the group name with member/game counts", async () => {
    mockedGetGroupPreview.mockResolvedValue({
      ok: true,
      data: { group: { id: "g1", name: "Family Night", memberCount: 4, gameCount: 3 } },
    });

    render(<JoinGroup token="tok-1" onClose={vi.fn()} onJoined={vi.fn()} />);

    await waitFor(() => expect(mockedGetGroupPreview).toHaveBeenCalledWith("tok-1"));
    expect(await screen.findByText(/join family night\?/i)).toBeTruthy();
    expect(screen.getByText(/4 members/i)).toBeTruthy();
    expect(screen.getByText(/3 games/i)).toBeTruthy();
  });

  it("calls joinGroup with the token then onJoined with the returned groupId", async () => {
    mockedGetGroupPreview.mockResolvedValue({
      ok: true,
      data: { group: { id: "g1", name: "Family Night", memberCount: 4, gameCount: 3 } },
    });
    mockedJoinGroup.mockResolvedValue({ ok: true, data: { ok: true, groupId: "g1" } });
    const onJoined = vi.fn();

    render(<JoinGroup token="tok-1" onClose={vi.fn()} onJoined={onJoined} />);

    fireEvent.click(await screen.findByRole("button", { name: /^join$/i }));

    await waitFor(() => expect(mockedJoinGroup).toHaveBeenCalledWith("tok-1"));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("g1"));
  });

  it("shows an error state with a dismiss when the preview is invalid", async () => {
    mockedGetGroupPreview.mockResolvedValue({
      ok: false,
      error: "This invite link is invalid or has expired.",
      status: 404,
    });
    const onClose = vi.fn();

    render(<JoinGroup token="bad-tok" onClose={onClose} onJoined={vi.fn()} />);

    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^join$/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /dismiss|ok|close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an error state with a dismiss when joining fails", async () => {
    mockedGetGroupPreview.mockResolvedValue({
      ok: true,
      data: { group: { id: "g1", name: "Family Night", memberCount: 4, gameCount: 3 } },
    });
    mockedJoinGroup.mockResolvedValue({ ok: false, error: "Something went wrong.", status: 500 });
    const onClose = vi.fn();

    render(<JoinGroup token="tok-1" onClose={onClose} onJoined={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /^join$/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /dismiss|ok|close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Not now is clicked", async () => {
    mockedGetGroupPreview.mockResolvedValue({
      ok: true,
      data: { group: { id: "g1", name: "Family Night", memberCount: 4, gameCount: 3 } },
    });
    const onClose = vi.fn();

    render(<JoinGroup token="tok-1" onClose={onClose} onJoined={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
