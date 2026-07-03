import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/membership";
import { archivePlayer } from "@/lib/claims";

export const runtime = "nodejs";

/**
 * Archives a legacy player (e.g. a migration straggler with no claimant),
 * removing it from the claimable pool. Admin-only — `requireAdmin`
 * re-resolves the viewer's role from the DB on every call, so a non-admin
 * (including an unauthenticated caller) always gets 401/403 before the
 * player is ever mutated.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  await archivePlayer(params.id, guard.viewer.userId);
  return NextResponse.json({ ok: true });
}
