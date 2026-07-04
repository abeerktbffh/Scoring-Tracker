import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { sql } from "@/db/client";
import { resolveViewer } from "@/lib/membership";
import { unclaimedLegacyPlayers, createPendingClaim, createFreshPlayer, migrationActive } from "@/lib/claims";
import { sendAdminJoinNotification } from "@/lib/email";

export const runtime = "nodejs";

const GROUP_ID = "g1";

async function clearEligibility(userId: string): Promise<void> {
  await sql`DELETE FROM join_eligibility WHERE user_id = ${userId} AND group_id = ${GROUP_ID}`;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const viewer = await resolveViewer();
  const alreadyMember = viewer?.player != null;

  // Open join: any authenticated user may join by creating a player — no invite
  // gate. (Legacy-player claiming is complete, so there's no history to protect.)
  const needsInvite = false;

  const active = await migrationActive(GROUP_ID);
  const unclaimed = active ? await unclaimedLegacyPlayers(GROUP_ID) : [];

  return NextResponse.json({
    alreadyMember,
    needsInvite,
    migrationActive: active,
    unclaimed,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Open join: any authenticated user may create a player and join — no invite
  // gate. Identity is still the authenticated session; only the invite/approval
  // requirement is removed.
  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    playerId?: unknown;
    displayName?: unknown;
  };

  if (body.action === "claim") {
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

    const result = await createPendingClaim(userId, playerId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (body.action === "create") {
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) return NextResponse.json({ error: "displayName required" }, { status: 400 });

    const player = await createFreshPlayer(userId, GROUP_ID, displayName);

    // The session/JWT never carries email (only `id`) — look it up fresh
    // from the DB, the same source of truth `resolveViewer` uses.
    const userRows = (await sql`SELECT email FROM users WHERE id = ${userId}`) as {
      email: string | null;
    }[];
    const userEmail = userRows[0]?.email;
    if (userEmail) {
      await sendAdminJoinNotification(displayName, userEmail);
    }

    // Eligibility has served its purpose once the player is created —
    // clear it so it can't be reused (idempotent no-op if already absent,
    // e.g. when the actor was already a member).
    await clearEligibility(userId);

    return NextResponse.json({ ok: true, player });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
