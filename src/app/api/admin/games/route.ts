import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireAdmin } from "@/lib/adminAuth";
import { validateNewGame } from "@/lib/validateGame";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = await requireAdmin(body);
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const game = validateNewGame(body);
  if ("error" in game) return NextResponse.json({ error: game.error }, { status: 422 });

  const existing = (await sql`
    SELECT id FROM games WHERE id = ${game.id} AND group_id = ${admin.groupId}
  `) as { id: string }[];
  if (existing[0]) return NextResponse.json({ error: "Game id already exists" }, { status: 409 });

  await sql`
    INSERT INTO games (id, group_id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${game.id}, ${admin.groupId}, ${game.name}, ${game.type}, ${game.metricDirection},
      ${game.parserId}, ${game.hasVariants})
  `;
  return NextResponse.json({ ok: true, game });
}
