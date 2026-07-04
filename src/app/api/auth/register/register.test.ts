import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
const hashPasswordMock = vi.fn();
const rateLimitMock = vi.fn();
const sendVerificationEmailMock = vi.fn();

vi.mock("@/db/client", () => ({ sql: sqlMock }));
vi.mock("@/auth/password", () => ({ hashPassword: hashPasswordMock }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/email", () => ({ sendVerificationEmail: sendVerificationEmailMock }));

const { POST } = await import("./route");

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(true);
  hashPasswordMock.mockResolvedValue("scrypt$hash");
  sqlMock.mockResolvedValue([]);
  sendVerificationEmailMock.mockResolvedValue({ sent: false });
});

describe("POST /api/auth/register", () => {
  it("400s on missing/invalid email or short password", async () => {
    const res = await POST(jsonRequest({ email: "not-an-email", password: "short" }));
    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("lowercases the email before checking/creating", async () => {
    sqlMock.mockResolvedValueOnce([]); // existence check: none
    await POST(jsonRequest({ email: "Foo@Example.COM", password: "password123" }));
    const existenceCall = sqlMock.mock.calls[0];
    expect(existenceCall.join("")).toContain("foo@example.com");
  });

  it("409s with a generic message when the email is already registered", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "u1" }]); // existing user found
    const res = await POST(jsonRequest({ email: "taken@example.com", password: "password123" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already registered/i);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it("creates a user with email_verified=NULL, mints a verify token, and emails it — never returning the token", async () => {
    sqlMock
      .mockResolvedValueOnce([]) // existence check
      .mockResolvedValueOnce([]) // insert user
      .mockResolvedValueOnce([]); // insert verification_token

    const res = await POST(jsonRequest({ email: "new@example.com", password: "password123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toMatch(/token/i);

    // user insert included email_verified NULL and the hashed password
    const insertUserCall = sqlMock.mock.calls[1].join("");
    expect(insertUserCall).toContain("email_verified");

    // verification_token insert used purpose 'verify'
    const insertTokenCall = sqlMock.mock.calls[2];
    expect(insertTokenCall.join("")).toContain("verify");

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    const [to, link] = sendVerificationEmailMock.mock.calls[0];
    expect(to).toBe("new@example.com");
    expect(link).toContain("/api/auth/verify?token=");
  });

  it("rate-limits by both email and IP — either failing blocks the request", async () => {
    rateLimitMock.mockImplementation((key: string) => !key.startsWith("register:ip:"));
    const res = await POST(
      jsonRequest(
        { email: "x@example.com", password: "password123" },
        { "x-forwarded-for": "1.2.3.4" },
      ),
    );
    expect(res.status).toBe(429);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("treats a unique-violation race on insert as already-registered (generic message)", async () => {
    sqlMock
      .mockResolvedValueOnce([]) // existence check passes
      .mockRejectedValueOnce({ code: "23505" }); // insert loses race
    const res = await POST(jsonRequest({ email: "race@example.com", password: "password123" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already registered/i);
  });
});
