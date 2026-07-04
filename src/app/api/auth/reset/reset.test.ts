import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
const hashPasswordMock = vi.fn();
const rateLimitMock = vi.fn();
const sendPasswordResetEmailMock = vi.fn();

vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/auth/password", () => ({ hashPassword: hashPasswordMock }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/email", () => ({ sendPasswordResetEmail: sendPasswordResetEmailMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/reset", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(true);
  hashPasswordMock.mockResolvedValue("scrypt$newhash");
  sendPasswordResetEmailMock.mockResolvedValue({ sent: false });
});

describe("POST /api/auth/reset — request step ({email})", () => {
  it("returns the same {ok:true} response for an unknown email, without sending an email", async () => {
    sqlMock.mockResolvedValueOnce([]); // user lookup: none
    sqlMock.mockResolvedValueOnce([{ "?column?": 1 }]); // dummy equivalent-cost query

    const res = await POST(jsonRequest({ email: "unknown@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("returns the same {ok:true} response for a Google-only user (no password_hash), without sending an email", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u1", email: "google@example.com", password_hash: null }]);
    sqlMock.mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await POST(jsonRequest({ email: "google@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("mints a reset token and emails it for a credentials user, returning the identical {ok:true} shape", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: "u2", email: "creds@example.com", password_hash: "scrypt$x" }])
      .mockResolvedValueOnce([]); // insert verification_token

    const res = await POST(jsonRequest({ email: "creds@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const insertTokenCall = sqlMock.mock.calls[1].join("");
    expect(insertTokenCall).toContain("reset");

    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    const [to, link] = sendPasswordResetEmailMock.mock.calls[0];
    expect(to).toBe("creds@example.com");
    expect(link).toContain("/reset?token=");
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it("never reveals existence even for malformed email input", async () => {
    const res = await POST(jsonRequest({ email: 12345 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("rate-limits by email and IP for the request step", async () => {
    rateLimitMock.mockImplementation((key: string) => !key.startsWith("reset:email:"));
    const res = await POST(jsonRequest({ email: "limited@example.com" }));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/auth/reset — confirm step ({token, newPassword})", () => {
  it("400s on missing token or short password", async () => {
    const res = await POST(jsonRequest({ token: "t", newPassword: "short" }));
    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("atomically deletes the reset token and updates the password on success", async () => {
    sqlMock
      .mockResolvedValueOnce([{ identifier: "creds@example.com" }]) // delete...returning
      .mockResolvedValueOnce([]); // update password

    const res = await POST(jsonRequest({ token: "good-reset-token", newPassword: "newpassword123" }));
    expect(res.status).toBe(200);

    const deleteCall = sqlMock.mock.calls[0].join("");
    expect(deleteCall).toContain("DELETE");
    expect(deleteCall).toContain("reset");
    expect(deleteCall).toContain("expires");

    const updateCall = sqlMock.mock.calls[1].join("");
    expect(updateCall).toContain("password_hash");
  });

  it("rejects with a generic error and touches nothing else when 0 rows are deleted (invalid/expired/used)", async () => {
    sqlMock.mockResolvedValueOnce([]); // no row matched
    const res = await POST(jsonRequest({ token: "bad-token", newPassword: "newpassword123" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid|expired/i);
    expect(sqlMock).toHaveBeenCalledTimes(1); // never reached the UPDATE
    expect(hashPasswordMock).not.toHaveBeenCalled(); // never hashes a password for a rejected token
  });

  it("a reset token can only be used once", async () => {
    sqlMock
      .mockResolvedValueOnce([{ identifier: "creds@example.com" }])
      .mockResolvedValueOnce([]);
    const first = await POST(jsonRequest({ token: "one-shot-reset", newPassword: "newpassword123" }));
    expect(first.status).toBe(200);

    sqlMock.mockResolvedValueOnce([]); // second attempt: already deleted
    const second = await POST(jsonRequest({ token: "one-shot-reset", newPassword: "newpassword123" }));
    expect(second.status).toBe(400);
  });
});
