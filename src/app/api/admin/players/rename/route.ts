import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = await requireAdmin(body);
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { playerId, newName } = body as { playerId?: string; newName?: string };
  if (typeof playerId !== "string" || typeof newName !== "string" || newName.trim().length === 0) {
    return NextResponse.json({ error: "playerId and newName required" }, { status: 400 });
  }
  const name = newName.trim();

  const player = (await sql`
    SELECT id FROM players WHERE id = ${playerId} AND group_id = ${admin.groupId}
  `) as { id: string }[];
  if (!player[0]) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const clash = (await sql`
    SELECT id FROM players WHERE group_id = ${admin.groupId} AND display_name = ${name} AND id <> ${playerId}
  `) as { id: string }[];
  if (clash[0]) return NextResponse.json({ error: "Name already taken" }, { status: 409 });

  await sql`UPDATE players SET display_name = ${name} WHERE id = ${playerId}`;
  return NextResponse.json({ ok: true });
}
