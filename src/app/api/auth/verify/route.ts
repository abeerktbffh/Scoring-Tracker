import { NextResponse } from "next/server";
import { sql } from "@/db/client";

export const runtime = "nodejs";

const GENERIC_INVALID = "This verification link is invalid or has expired.";

/**
 * Verifies a registration email.
 *
 * Single-use: the token is looked up and DELETEd in the same statement
 * (`DELETE ... RETURNING`), so a token can never be redeemed twice — even
 * under concurrent requests, only one can win the row. `expires` is checked
 * against the returned row before any user is updated. Matches by token AND
 * purpose='verify' so a reset token can never be used to verify an email.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";

  if (!token) {
    return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
  }

  const rows = (await sql`
    DELETE FROM verification_token
    WHERE token = ${token} AND purpose = 'verify'
    RETURNING identifier, expires
  `) as { identifier: string; expires: string | Date }[];

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
  }

  const expiresAtMs = new Date(row.expires).getTime();
  if (Date.now() >= expiresAtMs) {
    return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
  }

  await sql`UPDATE users SET email_verified = now() WHERE email = ${row.identifier}`;

  return NextResponse.json({ ok: true });
}
