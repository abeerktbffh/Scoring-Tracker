import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/lib/membership", () => ({ requireUser: requireUserMock }));
vi.mock("@/db/client", () => ({ sql: sqlMock }));

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/games", () => {
  it("401s when unauthenticated, never touching the DB", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthenticated" });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the games shape for an authenticated user, with no group filter", async () => {
    requireUserMock.mockResolvedValue(AUTHED_VIEWER);
    sqlMock.mockResolvedValueOnce([
      {
        id: "g_wordle",
        name: "Wordle",
        type: "numeric",
        metric_direction: "lower_better",
        has_variants: false,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      games: [
        {
          id: "g_wordle",
          name: "Wordle",
          type: "numeric",
          metricDirection: "lower_better",
          hasVariants: false,
        },
      ],
    });

    const queryText = sqlMock.mock.calls[0][0].join("");
    expect(queryText).not.toMatch(/group_id/);
    expect(queryText).toMatch(/active = true/);
  });
});
