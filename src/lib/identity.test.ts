import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { nameClashExists, setDisplayName } = await import("./identity");

beforeEach(() => vi.clearAllMocks());

describe("nameClashExists", () => {
  it("is true when another user holds the name (case-insensitive)", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u2" }]);
    expect(await nameClashExists("Abeer")).toBe(true);
  });
  it("is false when no row matches", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await nameClashExists("Zaphod")).toBe(false);
  });
});

describe("setDisplayName", () => {
  it("returns name-taken on a clash without updating", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u2" }]); // clash check
    const r = await setDisplayName("u1", "Abeer");
    expect(r).toEqual({ ok: false, reason: "name-taken" });
    expect(sqlMock).toHaveBeenCalledTimes(1); // no UPDATE
  });
  it("updates and returns ok when free", async () => {
    sqlMock.mockResolvedValueOnce([]); // clash check
    sqlMock.mockResolvedValueOnce([]); // update
    const r = await setDisplayName("u1", "Zaphod");
    expect(r).toEqual({ ok: true });
  });
  it("maps a 23505 on the unique index to name-taken (race backstop)", async () => {
    sqlMock.mockResolvedValueOnce([]); // clash check passes
    sqlMock.mockRejectedValueOnce({ code: "23505", constraint: "users_display_name_lower_uq" });
    const r = await setDisplayName("u1", "Zaphod");
    expect(r).toEqual({ ok: false, reason: "name-taken" });
  });
});
