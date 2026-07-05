import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const groupPreviewByTokenMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/groups", () => ({ groupPreviewByToken: groupPreviewByTokenMock }));

// Imported after the mocks so the route picks up the mocked modules.
const { GET } = await import("./route");

const AUTHED_VIEWER = {
  ok: true as const,
  viewer: {
    userId: "u1",
    displayName: "Session User",
    isSuperAdmin: false,
  },
};

function getRequest(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/groups/preview", () => {
  it("401s when unauthenticated, never touching groupPreviewByToken", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET(getRequest("http://localhost/api/groups/preview?token=tok_abc"));
    expect(res.status).toBe(401);
    expect(groupPreviewByTokenMock).not.toHaveBeenCalled();
  });

  it("404s when the token doesn't resolve to a group", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    groupPreviewByTokenMock.mockResolvedValue(null);

    const res = await GET(getRequest("http://localhost/api/groups/preview?token=bad-token"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("200s with the group preview on success", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    groupPreviewByTokenMock.mockResolvedValue({
      id: "grp_1",
      name: "Book Club",
      memberCount: 3,
      gameCount: 2,
    });

    const res = await GET(getRequest("http://localhost/api/groups/preview?token=tok_abc"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      group: { id: "grp_1", name: "Book Club", memberCount: 3, gameCount: 2 },
    });
    expect(groupPreviewByTokenMock).toHaveBeenCalledWith("tok_abc");
  });
});
