import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/membership";
import { approveClaim, rejectClaim, type ApproveClaimReason } from "@/lib/claims";
import { sendAdminJoinNotification } from "@/lib/email";

export const runtime = "nodejs";

function statusForApproveReason(reason: ApproveClaimReason): number {
  return reason === "not-found" ? 404 : 409;
}

/**
 * Approves or rejects a pending legacy-player claim. Admin-only —
 * `requireAdmin` re-resolves the viewer's role from the DB on every call, so
 * a non-admin (including an unauthenticated caller) always gets 401/403
 * before the claim is ever read or mutated.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { decision?: unknown };
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const claimId = params.id;

  if (decision === "reject") {
    await rejectClaim(claimId, guard.viewer.userId);
    return NextResponse.json({ ok: true });
  }

  const result = await approveClaim(claimId, guard.viewer.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: statusForApproveReason(result.reason) });
  }

  // The join completes on approval — notify the admin the same way a
  // brand-new player creation would.
  if (result.userEmail) {
    await sendAdminJoinNotification(result.playerName, result.userEmail);
  }

  return NextResponse.json({ ok: true });
}
