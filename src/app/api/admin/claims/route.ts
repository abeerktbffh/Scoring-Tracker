import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/membership";
import { listPendingClaims } from "@/lib/claims";

export const runtime = "nodejs";

const GROUP_ID = "g1";

/**
 * Lists pending legacy-player claims for the group, for admin review.
 * Admin-only — `requireAdmin` re-resolves the viewer's role from the DB on
 * every call, so a non-admin (including an unauthenticated caller) always
 * gets 401/403 and never reaches `listPendingClaims`.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const claims = await listPendingClaims(GROUP_ID);
  return NextResponse.json({ claims });
}
