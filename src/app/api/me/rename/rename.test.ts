import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMemberMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireMember: requireMemberMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/me/rename", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const MEMBER_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    player: { id: "pSelf", displayName: "Old Name" },
    isAdmin: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/me/rename", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await POST(jsonRequest({ newName: "New Name" }));
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("403s a non-member, never touching the DB", async () => {
    requireMemberMock.mockResolvedValue({ ok: false, status: 403, error: "Not a member" });

    const res = await POST(jsonRequest({ newName: "New Name" }));
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("400s when newName is missing or blank", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);

    const res = await POST(jsonRequest({ newName: "   " }));
    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("400s when newName exceeds 40 characters", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);

    const res = await POST(jsonRequest({ newName: "x".repeat(41) }));
    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("409s when the name clashes case-insensitively with another player, excluding self", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    sqlMock.mockResolvedValueOnce([{ id: "pOther" }]); // clash found

    const res = await POST(jsonRequest({ newName: "abeer" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("That name is taken — pick another.");

    const clashCall = sqlMock.mock.calls[0];
    const [strings, ...values] = clashCall as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("lower(display_name)");
    expect(values).toContain("pSelf"); // excludes caller's own player id
  });

  it("renames on success, using identity from requireMember (not the request body)", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_VIEWER);
    sqlMock
      .mockResolvedValueOnce([]) // no clash
      .mockResolvedValueOnce([]); // update

    const res = await POST(jsonRequest({ newName: " New Name ", playerId: "someone-elses-id" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, displayName: "New Name" });

    const updateCall = sqlMock.mock.calls[1];
    const [strings, ...values] = updateCall as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("UPDATE players");
    expect(values).toContain("New Name");
    expect(values).toContain("pSelf"); // target is the session's own player, never the body's playerId
    expect(values).not.toContain("someone-elses-id");
  });
});
