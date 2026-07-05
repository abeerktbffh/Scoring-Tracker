import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser, requireMember } from "@/lib/membership";

export const runtime = "nodejs";

/**
 * The game catalog is global by default: access is gated by session identity
 * (`requireUser`), not group membership. `requireUser` re-resolves identity
 * from the DB on every call: no session -> 401.
 *
 * An optional `?group=<id>` scopes the catalog to that group's tracked
 * games; access is then gated by `requireMember` (403 for non-members).
 */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("group");
  const guard = groupId ? await requireMember(groupId) : await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const rows = (groupId
    ? await sql`
        SELECT g.id, g.name, g.type, g.metric_direction, g.has_variants
        FROM games g
        JOIN group_games gg ON gg.game_id = g.id AND gg.group_id = ${groupId}
        WHERE g.active = true
        ORDER BY g.name
      `
    : await sql`
        SELECT id, name, type, metric_direction, has_variants
        FROM games WHERE active = true
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
