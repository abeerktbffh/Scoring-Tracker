import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
vi.mock("@/db/client", () => ({ sql: sqlMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/verify", () => {
  it("400s when token is missing", async () => {
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("deletes the token and sets email_verified=now() on success", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    sqlMock
      .mockResolvedValueOnce([{ identifier: "user@example.com", expires: future }]) // delete...returning
      .mockResolvedValueOnce([]); // update users

    const res = await POST(jsonRequest({ token: "good-token" }));
    expect(res.status).toBe(200);

    const deleteCall = sqlMock.mock.calls[0].join("");
    expect(deleteCall).toContain("DELETE");
    expect(deleteCall).toContain("verify");

    const updateCall = sqlMock.mock.calls[1].join("");
    expect(updateCall).toContain("email_verified");
  });

  it("generic 400 when the token doesn't exist (already used or never existed)", async () => {
    sqlMock.mockResolvedValueOnce([]); // no row deleted
    const res = await POST(jsonRequest({ token: "bogus" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid|expired/i);
    // Only the delete ran — never touched users.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("generic 400 when the token is expired, and does not verify the user", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    sqlMock.mockResolvedValueOnce([{ identifier: "user@example.com", expires: past }]);
    const res = await POST(jsonRequest({ token: "expired-token" }));
    expect(res.status).toBe(400);
    expect(sqlMock).toHaveBeenCalledTimes(1); // never reached the UPDATE
  });

  it("a token can only be used once (second call sees no row)", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    sqlMock
      .mockResolvedValueOnce([{ identifier: "user@example.com", expires: future }])
      .mockResolvedValueOnce([]);
    const first = await POST(jsonRequest({ token: "one-shot" }));
    expect(first.status).toBe(200);

    sqlMock.mockResolvedValueOnce([]); // second delete finds nothing
    const second = await POST(jsonRequest({ token: "one-shot" }));
    expect(second.status).toBe(400);
  });
});
