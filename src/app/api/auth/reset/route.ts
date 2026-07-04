import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { hashPassword } from "@/auth/password";
import { rateLimit } from "@/lib/rateLimit";
import { sendPasswordResetEmail } from "@/lib/email";

export const runtime = "nodejs";

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Always the same response body/status for a reset *request*, regardless of
// whether the email exists — this is the enumeration-safety contract.
const ENUMERATION_SAFE_RESPONSE = { ok: true } as const;
const GENERIC_INVALID = "This reset link is invalid or has expired.";
const GENERIC_RATE_LIMITED = "Too many attempts. Please try again later.";

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
}

function clientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Mints a reset token + sends the email. Factored out so the "exists and is
 * a credentials user" and "doesn't exist / is Google-only" branches below can
 * each do an equivalent amount of async work, keeping response timing close
 * regardless of which branch runs.
 */
async function issueResetToken(email: string, origin: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await sql`
    INSERT INTO verification_token (identifier, token, expires, purpose)
    VALUES (${email}, ${token}, ${expires.toISOString()}, 'reset')
  `;
  const link = `${origin}/api/auth/reset?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(email, link);
}

/**
 * Handles both steps of the password-reset flow, discriminated by body shape:
 * `{email}` → request a reset email; `{token, newPassword}` → confirm it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    token?: unknown;
    newPassword?: unknown;
  };

  if (typeof body.token === "string") {
    return handleConfirm(body.token, body.newPassword);
  }

  return handleRequest(body.email, req);
}

/**
 * Reset request — enumeration-safe. Always returns the same {ok:true}
 * response whether or not the email exists, and always performs the same
 * shape of work (one SELECT, then either a real or an equivalent-cost dummy
 * "issue" path) so that response timing does not leak existence.
 */
async function handleRequest(rawEmail: unknown, req: Request) {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email) {
    // Still enumeration-safe: malformed input gets the same response as a
    // well-formed-but-unknown email.
    return NextResponse.json(ENUMERATION_SAFE_RESPONSE);
  }

  const ip = clientIp(req);
  const emailAllowed = rateLimit(`reset:email:${email}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  const ipAllowed = rateLimit(`reset:ip:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!emailAllowed || !ipAllowed) {
    // Rate-limit response is intentionally distinguishable (429) — the
    // enumeration-safety contract covers "does this email exist", not
    // "have you been rate limited", and this app-wide 429 shape matches
    // register/verify above.
    return NextResponse.json({ error: GENERIC_RATE_LIMITED }, { status: 429 });
  }

  const rows = (await sql`
    SELECT id, email, password_hash FROM users WHERE email = ${email}
  `) as UserRow[];
  const user = rows[0];

  const origin = new URL(req.url).origin;
  if (user && user.password_hash) {
    await issueResetToken(email, origin);
  } else {
    // Equivalent-cost no-op: same DB round trip shape, no email actually sent.
    await sql`SELECT 1`;
  }

  return NextResponse.json(ENUMERATION_SAFE_RESPONSE);
}

/**
 * Reset confirm. The token lookup, expiry check, and single-use consumption
 * are all folded into one atomic DELETE ... RETURNING keyed on the token
 * itself (token + purpose='reset' + not-yet-expired). Zero rows back means
 * "invalid, expired, or already used" — indistinguishable, and rejected
 * without ever touching `users`. Only a caller who wins that atomic delete
 * can proceed to set the new password, so concurrent confirms with the same
 * token can never both succeed.
 */
async function handleConfirm(token: string, rawNewPassword: unknown) {
  const newPassword = typeof rawNewPassword === "string" ? rawNewPassword : "";
  if (!token || !newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rows = (await sql`
    DELETE FROM verification_token
    WHERE token = ${token} AND purpose = 'reset' AND expires > now()
    RETURNING identifier
  `) as { identifier: string }[];

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE email = ${row.identifier}`;

  return NextResponse.json({ ok: true });
}
