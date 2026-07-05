import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeError,
  createGroup,
  listMyGroups,
  joinGroup,
  getGroupPreview,
  renameGroup,
  deleteGroup,
  setGroupGames,
  removeMember,
  leaveGroup,
  resetGroupInvite,
  getGroupInvite,
  getLeaderboard,
  getBoard,
  getMe,
  getGames,
} from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("normalizeError", () => {
  it("maps known statuses to friendly copy", () => {
    expect(normalizeError(401, {})).toMatch(/sign in|passphrase/i);
    expect(normalizeError(422, { error: "Could not parse result" })).toBe("Could not parse result");
    expect(normalizeError(500, {})).toMatch(/something went wrong/i);
  });

  it("prefers body.error when present, regardless of status", () => {
    expect(normalizeError(403, { error: "Custom message" })).toBe("Custom message");
  });

  it("maps 403 to an access-denied message when no body.error is given", () => {
    expect(normalizeError(403, {})).toBe("You don't have access to this.");
  });

  it("maps 401 to a sign-in message when no body.error is given", () => {
    expect(normalizeError(401, {})).toBe("Please sign in again.");
  });

  it("maps 422 to a parse-format message when no body.error is given", () => {
    expect(normalizeError(422, {})).toBe("Couldn't read that — check the format.");
  });

  it("maps unknown statuses to a generic message", () => {
    expect(normalizeError(500, {})).toBe("Something went wrong — try again.");
    expect(normalizeError(0, undefined)).toBe("Something went wrong — try again.");
  });
});

describe("group client fns", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createGroup POSTs to /api/groups with name and gameIds", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "g1", link: "http://x/?join=tok" }));
    const result = await createGroup("Family", ["wordle"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Family", gameIds: ["wordle"] }),
      })
    );
    expect(result).toEqual({ ok: true, data: { id: "g1", link: "http://x/?join=tok" } });
  });

  it("listMyGroups GETs /api/groups", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { groups: [] }));
    const result = await listMyGroups();
    expect(fetchMock).toHaveBeenCalledWith("/api/groups", undefined);
    expect(result).toEqual({ ok: true, data: { groups: [] } });
  });

  it("joinGroup POSTs to /api/groups/join with the token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, groupId: "g1" }));
    await joinGroup("tok123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/join",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "tok123" }) })
    );
  });

  it("getGroupPreview GETs /api/groups/preview with an encoded token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { group: { id: "g1", name: "Family", memberCount: 2, gameCount: 1 } }));
    await getGroupPreview("tok 123");
    expect(fetchMock).toHaveBeenCalledWith(`/api/groups/preview?token=${encodeURIComponent("tok 123")}`, undefined);
  });

  it("renameGroup PATCHes /api/groups/:id with the new name", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await renameGroup("g1", "New Name");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/g1",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      })
    );
  });

  it("deleteGroup DELETEs /api/groups/:id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await deleteGroup("g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/groups/g1", expect.objectContaining({ method: "DELETE" }));
  });

  it("setGroupGames PUTs /api/groups/:id/games with gameIds", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await setGroupGames("g1", ["wordle", "connections"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/g1/games",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameIds: ["wordle", "connections"] }),
      })
    );
  });

  it("removeMember DELETEs /api/groups/:id/members/:userId", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await removeMember("g1", "u2");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/g1/members/u2",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("leaveGroup POSTs to /api/groups/:id/leave", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await leaveGroup("g1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/g1/leave",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) })
    );
  });

  it("resetGroupInvite POSTs to /api/groups/:id/invite", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { link: "http://x/?join=tok2" }));
    await resetGroupInvite("g1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/g1/invite",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) })
    );
  });

  it("getGroupInvite GETs /api/groups/:id/invite", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { link: "http://x/?join=tok3" }));
    const result = await getGroupInvite("g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/groups/g1/invite", undefined);
    expect(result).toEqual({ ok: true, data: { link: "http://x/?join=tok3" } });
  });

  it("URL-encodes ids containing special characters", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await renameGroup("g/1", "X");
    expect(fetchMock).toHaveBeenCalledWith(`/api/groups/${encodeURIComponent("g/1")}`, expect.anything());
  });
});

describe("optional group param on read fns", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getLeaderboard appends group when provided", async () => {
    await getLeaderboard("daily", undefined, "g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/leaderboard?window=daily&group=g1", undefined);
  });

  it("getLeaderboard omits group when not provided", async () => {
    await getLeaderboard("daily");
    expect(fetchMock).toHaveBeenCalledWith("/api/leaderboard?window=daily", undefined);
  });

  it("getBoard appends group when provided", async () => {
    await getBoard("wordle", "weekly", undefined, "g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/games/wordle/board?window=weekly&group=g1", undefined);
  });

  it("getBoard omits group when not provided", async () => {
    await getBoard("wordle", "weekly");
    expect(fetchMock).toHaveBeenCalledWith("/api/games/wordle/board?window=weekly", undefined);
  });

  it("getMe appends group when provided", async () => {
    await getMe("alice", "g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/me?player=alice&group=g1", undefined);
  });

  it("getMe omits group when not provided", async () => {
    await getMe("alice");
    expect(fetchMock).toHaveBeenCalledWith("/api/me?player=alice", undefined);
  });

  it("getGames appends group when provided", async () => {
    await getGames("g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/games?group=g1", undefined);
  });

  it("getGames omits group when not provided", async () => {
    await getGames();
    expect(fetchMock).toHaveBeenCalledWith("/api/games", undefined);
  });
});
