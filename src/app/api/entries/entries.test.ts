import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const sqlMock = vi.fn();
const resolveSubmissionMock = vi.fn();
const captureMessageMock = vi.fn();
const flushMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireMember: requireMemberMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/lib/submission", () => ({ resolveSubmission: resolveSubmissionMock }));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: captureMessageMock,
  flush: flushMock,
}));

// Imported after the mocks so the route picks up the mocked modules.
const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/entries", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const MEMBER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    player: { id: "p_session", displayName: "Session Player" },
    isAdmin: false,
  },
};

const RESOLVED_SUBMISSION = {
  gameId: "g_wordle",
  variant: null,
  value: 4,
  solved: true,
  puzzleNumber: 999,
  rawInput: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  flushMock.mockResolvedValue(undefined);
});

describe("POST /api/entries", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ gameId: "g1", value: 4, solved: true }));
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s an authenticated non-member, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await POST(jsonRequest({ gameId: "g1", value: 4, solved: true }));
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("attributes the entry to the session player's id, ignoring any client-supplied identity", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([{ id: "g_wordle" }]) // game exists
      .mockResolvedValueOnce([]) // no prior entry
      .mockResolvedValueOnce([]); // insert

    const res = await POST(
      jsonRequest({
        gameId: "g_wordle",
        value: 4,
        solved: true,
        // Attempted spoof — must be ignored entirely.
        displayName: "Attacker",
        pin: "0000",
        playerId: "p_attacker",
      }),
    );

    expect(res.status).toBe(200);
    const insertCall = sqlMock.mock.calls[3];
    const [strings, ...values] = insertCall as [TemplateStringsArray, ...unknown[]];
    const insertQuery = strings.join("");
    expect(insertQuery).toContain("INSERT INTO entries");
    // player_id bound value must be the session player, never the spoofed one.
    expect(values).toContain("p_session");
    expect(values).not.toContain("p_attacker");
  });

  it("rejects unknown games with 422 without ever inserting", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([]); // no matching game

    const res = await POST(jsonRequest({ gameId: "g_wordle", value: 4, solved: true }));
    expect(res.status).toBe(422);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("returns the parser's error/status on an unparseable rawInput and alerts Sentry", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    resolveSubmissionMock.mockReturnValue({ error: "Could not parse result", status: 422 });

    const res = await POST(jsonRequest({ rawInput: "not a real puzzle share" }));
    expect(res.status).toBe(422);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(captureMessageMock).toHaveBeenCalled();
    expect(flushMock).toHaveBeenCalled();
  });

  it("supersedes a prior active entry for the same player/game/variant/day", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([{ id: "g_wordle" }]) // game exists
      .mockResolvedValueOnce([{ id: "e_prior", version: 1 }]) // prior entry
      .mockResolvedValueOnce([]) // insert
      .mockResolvedValueOnce([]); // supersede update

    const res = await POST(jsonRequest({ gameId: "g_wordle", value: 4, solved: true }));
    expect(res.status).toBe(200);
    expect(sqlMock).toHaveBeenCalledTimes(5);
  });
});
