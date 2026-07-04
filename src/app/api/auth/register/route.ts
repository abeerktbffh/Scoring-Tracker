import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/auth/password";
import { rateLimit } from "@/lib/rateLimit";
import { sendVerificationEmail } from "@/lib/email";

export const runtime = "nodejs";

const VERIFY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const GENERIC_ALREADY_REGISTERED =
  "This email is already registered — sign in instead.";
const GENERIC_RATE_LIMITED = "Too many attempts. Please try again later.";

/** Best-effort client IP extraction from standard proxy headers. Never trusted for authz — used only as a rate-limit key. */
function clientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Registers a new credentials user.
 *
 * One-method-per-email: if any user (Google or credentials) already owns this
 * email, registration is rejected with a generic message — no distinction is
 * made between "taken by Google" and "taken by credentials" so the response
 * never leaks which auth method the existing account uses.
 *
 * The verification token is single-use (`verification_token`, purpose
 * 'verify', 30 min TTL) and is only ever emailed — never returned here.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const ip = clientIp(req);
  const emailAllowed = rateLimit(`register:email:${email}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  const ipAllowed = rateLimit(`register:ip:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!emailAllowed || !ipAllowed) {
    return NextResponse.json({ error: GENERIC_RATE_LIMITED }, { status: 429 });
  }

  const existingRows = (await sql`SELECT id FROM users WHERE email = ${email}`) as { id: string }[];
  if (existingRows.length > 0) {
    return NextResponse.json({ error: GENERIC_ALREADY_REGISTERED }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const userId = newId("u");

  try {
    await sql`
      INSERT INTO users (id, email, email_verified, password_hash)
      VALUES (${userId}, ${email}, NULL, ${passwordHash})
    `;
  } catch (err) {
    // A concurrent registration for the same email lost the race between our
    // existence check and this insert — report the same generic message
    // rather than a 500/constraint error.
    const e = err as { code?: string } | undefined;
    if (e?.code === "23505") {
      return NextResponse.json({ error: GENERIC_ALREADY_REGISTERED }, { status: 409 });
    }
    throw err;
  }

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + VERIFY_TTL_MS);
  await sql`
    INSERT INTO verification_token (identifier, token, expires, purpose)
    VALUES (${email}, ${token}, ${expires.toISOString()}, 'verify')
  `;

  const origin = new URL(req.url).origin;
  const link = `${origin}/verify?token=${encodeURIComponent(token)}`;
  await sendVerificationEmail(email, link);

  return NextResponse.json({ ok: true });
}
