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
    SELECT id, name, type, metric_direction, has_variants
    FROM games WHERE group_id = ${groupId} AND active = true
    ORDER BY name
  `) as {
    id: string;
    name: string;
    type: string;
    metric_direction: string;
    has_variants: boolean;
  }[];

  const games = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    metricDirection: r.metric_direction,
    hasVariants: r.has_variants,
  }));
  return NextResponse.json({ games });
}
