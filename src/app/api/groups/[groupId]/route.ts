import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireGroupAdmin } from "@/lib/membership";
import { renameGroup } from "@/lib/groups";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const result = await renameGroup(params.groupId, typeof body.name === "string" ? body.name : "");
  if (!result.ok) {
    return NextResponse.json({ error: "Enter a group name (1–40 characters)." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Cascades memberships/group_games via FK ON DELETE CASCADE.
  await sql`DELETE FROM groups WHERE id = ${params.groupId}`;
  return NextResponse.json({ ok: true });
}
