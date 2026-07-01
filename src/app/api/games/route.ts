import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = (await sql`
    SELECT id, name, type, metric_direction, has_variants
    FROM games WHERE group_id = ${payload.groupId} AND active = true
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
