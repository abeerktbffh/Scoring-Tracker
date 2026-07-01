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
    SELECT id, display_name FROM players WHERE group_id = ${payload.groupId} ORDER BY display_name
  `) as { id: string; display_name: string }[];
  return NextResponse.json({ players: rows.map((r) => ({ id: r.id, displayName: r.display_name })) });
}
