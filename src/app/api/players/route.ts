import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireMember } from "@/lib/membership";
import { GROUP_ID } from "@/lib/group";

export const runtime = "nodejs";

/**
 * Group-level access is now gated by session membership (`requireMember`),
 * not the legacy `group_token` cookie. `requireMember` re-resolves
 * membership from the DB on every call: no session -> 401, session but not
 * a member of the group -> 403.
 */
export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const groupId = GROUP_ID;

  const rows = (await sql`
    SELECT id, display_name FROM players WHERE group_id = ${groupId} ORDER BY display_name
  `) as { id: string; display_name: string }[];
  return NextResponse.json({ players: rows.map((r) => ({ id: r.id, displayName: r.display_name })) });
}
