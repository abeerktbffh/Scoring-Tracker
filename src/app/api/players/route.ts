import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser } from "@/lib/membership";

export const runtime = "nodejs";

/**
 * The players list is global and means "all named users" now that players
 * and users are unified. Access is gated by session identity (`requireUser`),
 * not group membership. `requireUser` re-resolves identity from the DB on
 * every call: no session -> 401.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const rows = (await sql`
    SELECT id, display_name FROM users WHERE display_name IS NOT NULL ORDER BY display_name
  `) as { id: string; display_name: string }[];
  return NextResponse.json({ players: rows.map((r) => ({ id: r.id, displayName: r.display_name })) });
}
