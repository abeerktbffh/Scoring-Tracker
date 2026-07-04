import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireAdmin } from "@/lib/membership";
import { GROUP_ID } from "@/lib/group";
import { validateNewGame } from "@/lib/validateGame";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const game = validateNewGame(body);
  if ("error" in game) return NextResponse.json({ error: game.error }, { status: 422 });

  const existing = (await sql`
    SELECT id FROM games WHERE id = ${game.id} AND group_id = ${GROUP_ID}
  `) as { id: string }[];
  if (existing[0]) return NextResponse.json({ error: "Game id already exists" }, { status: 409 });

  await sql`
    INSERT INTO games (id, group_id, name, type, metric_direction, parser_id, has_variants)
    VALUES (${game.id}, ${GROUP_ID}, ${game.name}, ${game.type}, ${game.metricDirection},
      ${game.parserId}, ${game.hasVariants})
  `;
  return NextResponse.json({ ok: true, game });
}
