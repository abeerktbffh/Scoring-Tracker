import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/membership";
import { createInvite } from "@/lib/invites";

export const runtime = "nodejs";

const GROUP_ID = "g1";

/**
 * Creates a new invite for the group. Admin-only — `requireAdmin` re-resolves
 * the viewer from the DB on every call, so a non-admin (including an
 * unauthenticated caller) always gets 401/403 and never reaches `createInvite`.
 * The raw token is returned exactly once here; only its hash is persisted.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { ttlMs?: unknown; maxUses?: unknown };
  const ttlMs = typeof body.ttlMs === "number" && body.ttlMs > 0 ? body.ttlMs : undefined;
  const maxUses = typeof body.maxUses === "number" && body.maxUses > 0 ? body.maxUses : undefined;

  const { token } = await createInvite(GROUP_ID, guard.viewer.userId, { ttlMs, maxUses });

  const origin = new URL(req.url).origin;
  const link = `${origin}/onboarding?invite=${encodeURIComponent(token)}`;

  return NextResponse.json({ token, link });
}
