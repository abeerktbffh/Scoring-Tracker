import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser } from "@/lib/membership";
import { generateImportToken } from "@/lib/importToken";

export const runtime = "nodejs";

/**
 * Mints (or rotates) the caller's import token. Returns the plaintext token
 * ONCE; only its hash is stored. Calling again revokes the previous token.
 * Session-only (you manage your own token) — no import-token auth here.
 */
export async function POST() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { token, tokenHash } = generateImportToken();
  await sql`UPDATE users SET import_token_hash = ${tokenHash} WHERE id = ${guard.viewer.userId}`;
  return NextResponse.json({ token });
}
