import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser } from "@/lib/membership";

export const runtime = "nodejs";

/**
 * The game catalog is global: access is gated by session identity
 * (`requireUser`), not group membership. `requireUser` re-resolves identity
 * from the DB on every call: no session -> 401.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const rows = (await sql`
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
