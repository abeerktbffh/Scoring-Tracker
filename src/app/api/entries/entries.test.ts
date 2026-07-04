import { describe, it, expect, vi, beforeEach } from "vitest";

const guardMock = vi.fn();
const sqlMock = vi.fn();
const resolveSubmissionMock = vi.fn();
const captureMessageMock = vi.fn();
const flushMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: guardMock }));
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

const USER_VIEWER = {
  ok: true as const,
  viewer: { userId: "u1", displayName: "A", isSuperAdmin: false },
};

const RESOLVED_SUBMISSION = {
  gameId: "wordle",
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
    guardMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ gameId: "g1", value: 4, solved: true }));
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("attributes the entry to the session user_id, not a client id", async () => {
    guardMock.mockResolvedValue({
      ok: true,
      viewer: { userId: "u1", displayName: "A", isSuperAdmin: false },
    });
    // resolveSubmission is real; feed a valid manual submission
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "Asia/Kolkata" }]) // group tz (pre-Task-9)
      .mockResolvedValueOnce([{ id: "wordle" }]) // game exists
      .mockResolvedValueOnce([]) // prior lookup: none
      .mockResolvedValueOnce([]); // insert
    const res = await POST(
      jsonRequest({ gameId: "wordle", value: 3, solved: true, playerId: "SPOOFED" }),
    );
    expect(res.status).toBe(200);
    // the INSERT bind list must contain u1, never "SPOOFED"
    const insertCall = sqlMock.mock.calls.find((c) =>
      String((c[0] as TemplateStringsArray).join("")).includes("INSERT INTO entries"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall!.slice(1)).toContain("u1");
    expect(insertCall!.slice(1)).not.toContain("SPOOFED");
  });

  it("rejects unknown games with 422 without ever inserting", async () => {
    guardMock.mockResolvedValue(USER_VIEWER);
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([]); // no matching game

    const res = await POST(jsonRequest({ gameId: "wordle", value: 4, solved: true }));
    expect(res.status).toBe(422);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("returns the parser's error/status on an unparseable rawInput and alerts Sentry", async () => {
    guardMock.mockResolvedValue(USER_VIEWER);
    resolveSubmissionMock.mockReturnValue({ error: "Could not parse result", status: 422 });

    const res = await POST(jsonRequest({ rawInput: "not a real puzzle share" }));
    expect(res.status).toBe(422);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(captureMessageMock).toHaveBeenCalled();
    expect(flushMock).toHaveBeenCalled();
  });

  it("supersedes a prior active entry for the same user/game/variant/day", async () => {
    guardMock.mockResolvedValue(USER_VIEWER);
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "UTC" }]) // groups
      .mockResolvedValueOnce([{ id: "wordle" }]) // game exists
      .mockResolvedValueOnce([{ id: "e_prior", version: 1 }]) // prior entry
      .mockResolvedValueOnce([]) // supersede update
      .mockResolvedValueOnce([]); // insert

    const res = await POST(jsonRequest({ gameId: "wordle", value: 4, solved: true }));
    expect(res.status).toBe(200);
    expect(sqlMock).toHaveBeenCalledTimes(5);
  });

  it("treats a 23505 on entries_active_uq as an idempotent re-log (200, supersede path)", async () => {
    guardMock.mockResolvedValue({
      ok: true,
      viewer: { userId: "u1", displayName: "A", isSuperAdmin: false },
    });
    resolveSubmissionMock.mockReturnValue(RESOLVED_SUBMISSION);
    sqlMock
      .mockResolvedValueOnce([{ timezone: "Asia/Kolkata" }])
      .mockResolvedValueOnce([{ id: "wordle" }])
      .mockResolvedValueOnce([]) // prior: none seen
      .mockRejectedValueOnce({ code: "23505", constraint: "entries_active_uq" }) // race: someone inserted
      .mockResolvedValueOnce([{ id: "e_existing", version: 1 }]) // re-read prior
      .mockResolvedValueOnce([]) // supersede
      .mockResolvedValueOnce([]); // insert retry
    const res = await POST(jsonRequest({ gameId: "wordle", value: 3, solved: true }));
    expect(res.status).toBe(200);
  });
});
