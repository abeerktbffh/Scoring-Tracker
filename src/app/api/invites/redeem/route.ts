import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { sql } from "@/db/client";
import { validateInvite, consumeInvite } from "@/lib/invites";

export const runtime = "nodejs";

const GROUP_ID = "g1";
const ELIGIBILITY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Redeems an invite token for the authenticated user. On success, records a
 * server-side `join_eligibility` row bound to (userId, groupId) — this is the
 * durable, revocable proof of "this user redeemed a valid invite" that
 * `POST /api/onboarding` re-checks from the DB. Nothing here is trusted back
 * from the client on subsequent requests.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Validate immediately before consuming so the redemption reflects the
  // invite's live status (not a stale check from earlier in the request).
  const result = await validateInvite(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + ELIGIBILITY_TTL_MS);
  await sql`
    INSERT INTO join_eligibility (user_id, group_id, invite_id, expires_at)
    VALUES (${userId}, ${GROUP_ID}, ${result.inviteId}, ${expiresAt.toISOString()})
    ON CONFLICT (user_id, group_id)
    DO UPDATE SET invite_id = EXCLUDED.invite_id, expires_at = EXCLUDED.expires_at
  `;

  await consumeInvite(result.inviteId);

  return NextResponse.json({ ok: true });
}
